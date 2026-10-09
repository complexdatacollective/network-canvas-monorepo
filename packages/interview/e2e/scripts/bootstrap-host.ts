import fs from 'node:fs/promises';
import path from 'node:path';

import { v4 as uuid } from 'uuid';

import {
  CURRENT_SCHEMA_VERSION,
  type CurrentProtocol,
  CurrentProtocolSchema,
  extractProtocol,
  migrateProtocol,
  missingAssetsError,
} from '@codaco/protocol-validation';

import { currentProtocolToPayload } from '../../src/contract/protocolPayload.ts';
import { SILOS_PROTOCOL_PATH } from '../helpers/protocol-paths.ts';

const HOST_URL = 'http://localhost:4101';
const ASSET_SERVER_URL = 'http://localhost:4200';
const ASSET_DIR = path.resolve(import.meta.dirname, '..', '.assets');

const protocolPath = process.argv[2] ?? SILOS_PROTOCOL_PATH;
// Slug names the asset-server-served directory holding both the prepared
// `bootstrap.json` and the extracted asset files. Stable per protocol so the
// auto-bootstrap URL (`?bootstrap=<slug>`) doesn't change between runs.
const slug =
  process.argv[3] ?? path.basename(protocolPath, path.extname(protocolPath));

async function main(): Promise<void> {
  const fileBuffer = await fs.readFile(protocolPath);
  const {
    protocol: protocolJson,
    assets: extractedAssets,
    missingAssets,
  } = await extractProtocol(fileBuffer);

  // Same rule as the Playwright fixture: a bootstrapped host must not serve
  // asset URLs for files that were never written. Extraction reports the gap
  // instead of refusing so an authoring tool can offer a repair; nothing here
  // can.
  if (missingAssets.length > 0) {
    throw missingAssetsError(missingAssets);
  }

  const protocolId = uuid();
  const protocolAssetDir = path.join(ASSET_DIR, slug);
  await fs.rm(protocolAssetDir, { recursive: true, force: true });
  await fs.mkdir(protocolAssetDir, { recursive: true });

  // Brought to the current schema the way a host does on import, so a fixture
  // saved by an earlier version of Architect still runs.
  const protocol = migrateProtocol(protocolJson, CURRENT_SCHEMA_VERSION, {
    name: slug,
  });
  const manifest = protocol.assetManifest ?? {};
  for (const asset of extractedAssets) {
    const entry = manifest[asset.id];
    if (!entry || entry.type === 'apikey') continue;

    const destPath = path.join(protocolAssetDir, entry.source);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    const content =
      asset.data instanceof Blob
        ? Buffer.from(await asset.data.arrayBuffer())
        : asset.data;
    await fs.writeFile(destPath, content);
  }

  const rewrittenStr = JSON.stringify(protocol).replace(
    /asset:\/\/([^"]+)/g,
    `${ASSET_SERVER_URL}/${slug}/$1`,
  );
  const rewrittenProtocol: CurrentProtocol = CurrentProtocolSchema.parse(
    JSON.parse(rewrittenStr),
  );

  const assetUrls = buildAssetUrls(rewrittenProtocol, slug);

  const payload = currentProtocolToPayload(rewrittenProtocol, {
    id: protocolId,
    importedAt: new Date().toISOString(),
  });

  const bootstrapPath = path.join(protocolAssetDir, 'bootstrap.json');
  await fs.writeFile(
    bootstrapPath,
    JSON.stringify({ protocol: payload, assetUrls }, null, 0),
  );

  process.stdout.write(
    `Protocol prepared: ${rewrittenProtocol.name ?? 'Untitled'} (slug=${slug})\n`,
  );
  process.stdout.write(
    `Open ${HOST_URL}/?bootstrap=${slug} to enter the interview.\n`,
  );
}

function buildAssetUrls(
  protocol: CurrentProtocol,
  protocolId: string,
): Record<string, string> {
  const urls: Record<string, string> = {};
  const manifest = protocol.assetManifest;
  if (!manifest) return urls;
  for (const [assetId, entry] of Object.entries(manifest)) {
    if (!entry || typeof entry !== 'object') continue;
    if (!('type' in entry) || entry.type === 'apikey') continue;
    if (!('source' in entry) || typeof entry.source !== 'string') continue;
    urls[assetId] = `${ASSET_SERVER_URL}/${protocolId}/${entry.source}`;
  }
  return urls;
}

await main();
