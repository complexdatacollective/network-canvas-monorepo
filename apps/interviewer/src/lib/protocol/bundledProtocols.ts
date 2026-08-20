import { type VersionedProtocol } from '@codaco/protocol-validation';
import sampleProtocolJson from '@codaco/protocols/sample';

import { type BundledProtocol, resolveAssets } from './bundledAssets';

// Vite inlines each bundled asset's raw bytes at transform time (`?arraybuffer`),
// so a bundled install never touches the network — required for offline install
// and enforced by the test that stubs `fetch` to throw. The map key is the file
// name, which matches the `source` of the corresponding `assetManifest` entry.
const sampleAssetBytes = import.meta.glob<ArrayBuffer>(
  '../../../../../packages/protocols/sample/assets/*',
  { query: '?arraybuffer', import: 'default', eager: true },
);

export function loadBundledSampleProtocol(): Promise<BundledProtocol> {
  // The single assertion boundary for this document, matching
  // `extractProtocolFromZip`'s treatment of an archive's `protocol.json`:
  // asserted here, validated by the import flow, never re-asserted downstream.
  // A JSON module's inferred literal type cannot describe the discriminated
  // union, so the widening step is unavoidable — it belongs here and nowhere
  // else.
  const document = sampleProtocolJson as unknown as VersionedProtocol;
  return Promise.resolve({
    document,
    assets: resolveAssets(document, sampleAssetBytes),
    name: 'Sample Protocol',
  });
}

// The Development protocol lives in its own module (bundledDevelopmentProtocol.ts)
// so it can be dynamically imported behind the `import.meta.env.DEV` guard in
// useProtocolImport.ts — its 23MB dev-only video must never ship in a
// production bundle.
