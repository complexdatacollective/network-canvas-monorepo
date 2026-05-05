import fs from "node:fs/promises";
import path from "node:path";
import type { Codebook, CurrentProtocol } from "@codaco/protocol-validation";
import { CurrentProtocolSchema, extractProtocol } from "@codaco/protocol-validation";
import type { Page } from "@playwright/test";
import { v4 as uuid } from "uuid";
import type { ProtocolPayload, ResolvedAsset, SessionPayload } from "../../src/contract/types.js";

type AssetEntry = {
	name: string;
	type: string;
	source?: string;
	value?: string;
};

type InstalledProtocol = {
	protocolId: string;
	name: string;
	stages: CurrentProtocol["stages"];
	codebook: Codebook;
	assetBasePath: string;
};

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
		this.assetDir = assetDir ?? path.resolve(process.cwd(), "e2e/.assets");
	}

	async install(protocolPath: string): Promise<InstalledProtocol> {
		const fileBuffer = await fs.readFile(protocolPath);
		const { protocol: protocolJson, assets: extractedAssets } = await extractProtocol(fileBuffer);

		const protocolId = uuid();
		const protocolAssetDir = path.join(this.assetDir, protocolId);
		await fs.mkdir(protocolAssetDir, { recursive: true });

		// Write each non-apikey asset to disk under the `source` filename
		// from the manifest so the asset server can serve it via the same
		// path the rewritten `asset://` URLs point to.
		const manifest = protocolJson.assetManifest ?? {};
		for (const asset of extractedAssets) {
			const manifestEntry = manifest[asset.id];
			if (!manifestEntry || typeof manifestEntry !== "object" || !("type" in manifestEntry)) continue;
			if (manifestEntry.type === "apikey") continue;
			if (!("source" in manifestEntry) || typeof manifestEntry.source !== "string") continue;

			const destPath = path.join(protocolAssetDir, manifestEntry.source);
			await fs.mkdir(path.dirname(destPath), { recursive: true });
			const content = asset.data instanceof Blob ? Buffer.from(await asset.data.arrayBuffer()) : asset.data;
			await fs.writeFile(destPath, content);
		}

		const protocolJsonStr = JSON.stringify(protocolJson);
		const rewrittenStr = protocolJsonStr.replace(/asset:\/\/([^"]+)/g, `${this.assetServerUrl}/${protocolId}/$1`);
		const rewrittenProtocol = CurrentProtocolSchema.parse(JSON.parse(rewrittenStr));

		const assets = this.buildResolvedAssets(rewrittenProtocol);

		const payload: ProtocolPayload = {
			...rewrittenProtocol,
			id: protocolId,
			importedAt: new Date().toISOString(),
			assets,
		};

		await this.page.evaluate((p: ProtocolPayload) => window.__test.installProtocol(p), payload);

		for (const asset of assets) {
			if (asset.type === "apikey") continue;
			const manifestEntry = rewrittenProtocol.assetManifest?.[asset.assetId];
			const source = manifestEntry && "source" in manifestEntry ? manifestEntry.source : undefined;
			if (!source) continue;
			const resolvedUrl = `${this.assetServerUrl}/${protocolId}/${source}`;
			await this.page.evaluate(([id, url]: [string, string]) => window.__test.setAssetUrl(id, url), [
				asset.assetId,
				resolvedUrl,
			] as [string, string]);
		}

		this.installedProtocolIds.push(protocolId);

		return {
			protocolId,
			name: rewrittenProtocol.name ?? "Untitled",
			stages: rewrittenProtocol.stages,
			codebook: rewrittenProtocol.codebook,
			assetBasePath: `${this.assetServerUrl}/${protocolId}`,
		};
	}

	private buildResolvedAssets(protocol: CurrentProtocol): ResolvedAsset[] {
		if (!protocol.assetManifest) return [];

		const assets: ResolvedAsset[] = [];
		const validTypes = ["image", "video", "audio", "network", "geojson"] as const;
		type ValidType = (typeof validTypes)[number];

		function isAssetEntry(entry: unknown): entry is AssetEntry {
			return typeof entry === "object" && entry !== null && "type" in entry;
		}

		function isValidType(t: string): t is ValidType {
			return (validTypes as readonly string[]).includes(t);
		}

		for (const [assetId, entry] of Object.entries(protocol.assetManifest)) {
			if (!isAssetEntry(entry)) continue;

			if (entry.type === "apikey") {
				assets.push({
					assetId,
					name: entry.name,
					type: "apikey",
					value: typeof entry.value === "string" ? entry.value : undefined,
				});
				continue;
			}

			if (!entry.source) continue;
			if (!isValidType(entry.type)) continue;

			assets.push({
				assetId,
				name: entry.name,
				type: entry.type,
			});
		}

		return assets;
	}

	async createInterview(protocolId: string, participantIdentifier?: string): Promise<string> {
		const participantId = participantIdentifier ?? `e2e-participant-${Date.now()}`;
		return this.page.evaluate(([pid, partId]: [string, string]) => window.__test.createInterview(pid, partId), [
			protocolId,
			participantId,
		] as [string, string]);
	}

	async getNetworkState(_interviewId: string): Promise<SessionPayload["network"] | undefined> {
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
			const actualValue = state?.ego.attributes[attributeId];
			if (JSON.stringify(actualValue) === expectedJson) return;
			await new Promise((resolve) => setTimeout(resolve, interval));
		}

		const finalState = await this.getNetworkState(interviewId);
		throw new Error(
			`Timeout waiting for ego attribute ${attributeId} to be ${expectedJson}. ` +
				`Actual value: ${JSON.stringify(finalState?.ego.attributes[attributeId])} after ${timeout}ms`,
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
			if (state?.nodes.some((n) => Object.values(n.attributes).includes(nodeName))) return;
			await new Promise((resolve) => setTimeout(resolve, interval));
		}

		throw new Error(`Timeout waiting for node "${nodeName}" to appear after ${timeout}ms`);
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
			const node = state?.nodes.find((n) => Object.values(n.attributes).includes(nodeName));
			if (node?.attributes[attributeId] != null) return;
			await new Promise((resolve) => setTimeout(resolve, interval));
		}

		const finalState = await this.getNetworkState(interviewId);
		const node = finalState?.nodes.find((n) => Object.values(n.attributes).includes(nodeName));
		throw new Error(
			`Timeout waiting for node "${nodeName}" attribute ${attributeId} to be set. ` +
				`Node found: ${!!node}, attribute value: ${JSON.stringify(node?.attributes[attributeId])} after ${timeout}ms`,
		);
	}

	async logNetworkState(interviewId: string): Promise<void> {
		const state = await this.getNetworkState(interviewId);
		process.stdout.write(`Network state for ${interviewId}:\n${JSON.stringify(state, null, 2)}\n`);
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
