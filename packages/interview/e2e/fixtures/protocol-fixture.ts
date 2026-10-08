import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';
import { v4 as uuid } from 'uuid';

import type { Codebook, CurrentProtocol } from '@codaco/protocol-validation';
import {
  CURRENT_SCHEMA_VERSION,
  extractProtocol,
  missingAssetsError,
  migrateProtocol,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { currentProtocolToPayload } from '../../src/contract/protocolPayload.js';
import type {
  ProtocolPayload,
  SessionPayload,
} from '../../src/contract/types.js';
import type { SyntheticPayloadResult } from '../helpers/synthetic-payload.js';

// Mirrors the host's testHooks SessionSeed (host/src is outside this
// tsconfig, so the shape is re-declared here like window-test.d.ts does).
export type SessionSeed = {
  network?: SessionPayload['network'];
  stageMetadata?: SessionPayload['stageMetadata'];
};

type InstalledProtocol = {
  protocolId: string;
  name: string;
  stages: CurrentProtocol['stages'];
  codebook: Codebook;
  assetBasePath: string;
};

// Brought to the current schema the way a host does on import, so a fixture
// saved by an earlier version of Architect still runs.
const toCurrentProtocol = (
  protocolJson: unknown,
  protocolPath: string,
): CurrentProtocol =>
  migrateProtocol(protocolJson, CURRENT_SCHEMA_VERSION, {
    name: path.basename(protocolPath, path.extname(protocolPath)),
  });

/**
 * ProtocolFixture extracts and installs real .netcanvas protocol files for e2e
 * testing without a database. It:
 *
 * 1. Extracts protocol.json from the ZIP file
 * 2. Copies assets to e2e/.assets/{protocolId}/ (served by the asset server)
 * 3. Rewrites asset:// URLs to {assetServerUrl}/{protocolId}/filename
 * 4. Registers the protocol and assets via window.__test hooks
 */
export class ProtocolFixture {
  private page: Page;
  private assetDir: string;
  private assetServerUrl: string;
  private installedProtocolIds: string[] = [];

  constructor(page: Page, assetServerUrl: string, assetDir?: string) {
    this.page = page;
    this.assetServerUrl = assetServerUrl;
    this.assetDir = assetDir ?? path.resolve(process.cwd(), 'e2e/.assets');
  }

  async install(protocolPath: string): Promise<InstalledProtocol> {
    const fileBuffer = await fs.readFile(protocolPath);
    const {
      protocol: protocolJson,
      assets: extractedAssets,
      missingAssets,
    } = await extractProtocol(fileBuffer);

    // Extraction reports a manifest entry with no file rather than refusing,
    // so an authoring tool can open the protocol and let the researcher supply
    // it. A fixture has no such move: installing it would write asset URLs for
    // files that do not exist, and every test that does not happen to touch
    // that stimulus would pass against a runtime fixture that is not valid.
    if (missingAssets.length > 0) {
      throw missingAssetsError(missingAssets);
    }

    const protocolId = uuid();
    const protocolAssetDir = path.join(this.assetDir, protocolId);
    await fs.mkdir(protocolAssetDir, { recursive: true });

    const protocolJsonStr = JSON.stringify(protocolJson);
    const rewrittenStr = protocolJsonStr.replace(
      /asset:\/\/([^"]+)/g,
      `${this.assetServerUrl}/${protocolId}/$1`,
    );
    const rewrittenProtocol = toCurrentProtocol(
      JSON.parse(rewrittenStr),
      protocolPath,
    );

    // Write each non-apikey asset to disk under the `source` filename from
    // the manifest so the asset server can serve it via the same path the
    // rewritten `asset://` URLs point to. Iterate after parse so the
    // discriminated-union narrowing on `type` is available.
    const manifest = rewrittenProtocol.assetManifest;
    if (manifest) {
      for (const asset of extractedAssets) {
        const manifestEntry = manifest[asset.id];
        if (!manifestEntry || manifestEntry.type === 'apikey') continue;

        const destPath = path.join(protocolAssetDir, manifestEntry.source);
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        const content =
          asset.data instanceof Blob
            ? Buffer.from(await asset.data.arrayBuffer())
            : asset.data;
        await fs.writeFile(destPath, content);
      }
    }

    const payload = currentProtocolToPayload(rewrittenProtocol, {
      id: protocolId,
      importedAt: new Date().toISOString(),
    });

    await this.installProtocolInHost(payload);

    for (const asset of payload.assets) {
      if (!asset.source) continue;
      const resolvedUrl = `${this.assetServerUrl}/${protocolId}/${asset.source}`;
      await this.page.evaluate(
        ([id, url]: [string, string]) => window.__test.setAssetUrl(id, url),
        [asset.assetId, resolvedUrl] as [string, string],
      );
    }

    this.installedProtocolIds.push(protocolId);

    return {
      protocolId,
      name: rewrittenProtocol.name ?? 'Untitled',
      stages: rewrittenProtocol.stages,
      codebook: rewrittenProtocol.codebook,
      assetBasePath: `${this.assetServerUrl}/${protocolId}`,
    };
  }

  /** Install an asset-free protocol JSON fixture directly. */
  async installJson(protocolPath: string): Promise<InstalledProtocol> {
    const protocolJson = JSON.parse(await fs.readFile(protocolPath, 'utf8'));
    const protocol = toCurrentProtocol(protocolJson, protocolPath);
    const protocolId = uuid();
    const payload = currentProtocolToPayload(protocol, {
      id: protocolId,
      importedAt: new Date().toISOString(),
    });

    await this.installProtocolInHost(payload);

    this.installedProtocolIds.push(protocolId);

    return {
      protocolId,
      name: protocol.name ?? 'Untitled',
      stages: protocol.stages,
      codebook: protocol.codebook,
      assetBasePath: `${this.assetServerUrl}/${protocolId}`,
    };
  }

  private installProtocolInHost(payload: ProtocolPayload): Promise<void> {
    return this.page.evaluate(
      (serializedPayload: string) =>
        window.__test.installProtocol(
          JSON.parse(serializedPayload) as ProtocolPayload,
        ),
      JSON.stringify(payload),
    );
  }

  /**
   * Install a SyntheticInterview-built payload (synthetic-payload adapter
   * output). Mirrors install(): copies asset files under
   * e2e/.assets/<protocolId>/, registers the protocol and asset URLs via
   * window.__test.
   */
  async installPayload(
    result: SyntheticPayloadResult,
  ): Promise<{ protocolId: string }> {
    const protocolId = result.protocol.id;
    const protocolAssetDir = path.join(this.assetDir, protocolId);
    await fs.mkdir(protocolAssetDir, { recursive: true });

    for (const file of result.assetFiles) {
      const destPath = path.join(protocolAssetDir, file.source);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(file.localPath, destPath);
    }

    await this.installProtocolInHost(result.protocol);

    for (const file of result.assetFiles) {
      const resolvedUrl = `${this.assetServerUrl}/${protocolId}/${file.source}`;
      await this.page.evaluate(
        ([id, url]: [string, string]) => window.__test.setAssetUrl(id, url),
        [file.assetId, resolvedUrl] as [string, string],
      );
    }

    this.installedProtocolIds.push(protocolId);
    return { protocolId };
  }

  async createInterview(
    protocolId: string,
    participantIdentifier?: string,
    session?: SessionSeed,
  ): Promise<string> {
    const participantId =
      participantIdentifier ?? `e2e-participant-${Date.now()}`;
    return this.page.evaluate(
      ([pid, partId, seed]: [string, string, SessionSeed | undefined]) =>
        window.__test.createInterview(pid, partId, seed),
      [protocolId, participantId, session] as [
        string,
        string,
        SessionSeed | undefined,
      ],
    );
  }

  async getNetworkState(
    _interviewId: string,
  ): Promise<SessionPayload['network'] | undefined> {
    return this.page.evaluate(() => window.__test.getNetworkState());
  }

  /**
   * Wait for nodes to appear in state.
   * Polls via window.__test until the expected number of nodes exist or timeout.
   */
  async waitForNodes(
    interviewId: string,
    expectedCount: number,
    options: { timeout?: number; interval?: number } = {},
  ): Promise<void> {
    const { timeout = 10000, interval = 500 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const state = await this.getNetworkState(interviewId);
      if ((state?.nodes.length ?? 0) >= expectedCount) return;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    const finalState = await this.getNetworkState(interviewId);
    throw new Error(
      `Timeout waiting for ${expectedCount} nodes. Found ${finalState?.nodes.length ?? 0} nodes after ${timeout}ms`,
    );
  }

  /**
   * Wait for an ego attribute to have a specific value.
   * Polls via window.__test until the attribute matches or timeout is reached.
   */
  async waitForEgoAttribute(
    interviewId: string,
    attributeId: string,
    expectedValue: unknown,
    options: { timeout?: number; interval?: number } = {},
  ): Promise<void> {
    const { timeout = 10000, interval = 500 } = options;
    const startTime = Date.now();
    const expectedJson = JSON.stringify(expectedValue);

    while (Date.now() - startTime < timeout) {
      const state = await this.getNetworkState(interviewId);
      const actualValue = state?.ego[entityAttributesProperty][attributeId];
      if (JSON.stringify(actualValue) === expectedJson) return;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    const finalState = await this.getNetworkState(interviewId);
    throw new Error(
      `Timeout waiting for ego attribute ${attributeId} to be ${expectedJson}. ` +
        `Actual value: ${JSON.stringify(finalState?.ego[entityAttributesProperty][attributeId])} after ${timeout}ms`,
    );
  }

  /**
   * Wait for a node with a specific name to exist in state.
   */
  async waitForNode(
    interviewId: string,
    nodeName: string,
    options: { timeout?: number; interval?: number } = {},
  ): Promise<void> {
    const { timeout = 15000, interval = 500 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const state = await this.getNetworkState(interviewId);
      if (
        state?.nodes.some((n) =>
          Object.values(n[entityAttributesProperty]).includes(nodeName),
        )
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error(
      `Timeout waiting for node "${nodeName}" to appear after ${timeout}ms`,
    );
  }

  /**
   * Wait for a node attribute to be set in state.
   */
  async waitForNodeAttribute(
    interviewId: string,
    nodeName: string,
    attributeId: string,
    options: { timeout?: number; interval?: number } = {},
  ): Promise<void> {
    const { timeout = 15000, interval = 500 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const state = await this.getNetworkState(interviewId);
      const node = state?.nodes.find((n) =>
        Object.values(n[entityAttributesProperty]).includes(nodeName),
      );
      if (node?.[entityAttributesProperty][attributeId] != null) return;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    const finalState = await this.getNetworkState(interviewId);
    const node = finalState?.nodes.find((n) =>
      Object.values(n[entityAttributesProperty]).includes(nodeName),
    );
    throw new Error(
      `Timeout waiting for node "${nodeName}" attribute ${attributeId} to be set. ` +
        `Node found: ${!!node}, attribute value: ${JSON.stringify(node?.[entityAttributesProperty][attributeId])} after ${timeout}ms`,
    );
  }

  async logNetworkState(interviewId: string): Promise<void> {
    const state = await this.getNetworkState(interviewId);
    process.stdout.write(
      `Network state for ${interviewId}:\n${JSON.stringify(state, null, 2)}\n`,
    );
  }

  async uninstall(protocolId: string): Promise<void> {
    const protocolAssetDir = path.join(this.assetDir, protocolId);
    await fs.rm(protocolAssetDir, { recursive: true, force: true });
  }

  async cleanup(): Promise<void> {
    for (const protocolId of this.installedProtocolIds) {
      await this.uninstall(protocolId);
    }
    this.installedProtocolIds = [];
  }
}
