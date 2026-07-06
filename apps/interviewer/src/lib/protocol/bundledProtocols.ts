import sampleProtocolJson from '@codaco/sample-protocol';

import { type BundledProtocol, resolveAssets } from './bundledAssets';

// Vite inlines each bundled asset's raw bytes at transform time (`?arraybuffer`),
// so a bundled install never touches the network — required for offline install
// and enforced by the test that stubs `fetch` to throw. The map key is the file
// name, which matches the `source` of the corresponding `assetManifest` entry.
const sampleAssetBytes = import.meta.glob<ArrayBuffer>(
  '../../../../../packages/sample-protocol/assets/*',
  { query: '?arraybuffer', import: 'default', eager: true },
);

export function loadBundledSampleProtocol(): Promise<BundledProtocol> {
  const document: unknown = sampleProtocolJson;
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
