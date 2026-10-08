import sampleProtocolJson from '@codaco/protocols/sample';

import { type BundledProtocol, resolveAssets } from './bundledAssets';

// Vite inlines each bundled asset's raw bytes at transform time (`?arraybuffer`),
// so a bundled install never touches the network — required for offline install
// and enforced by the test that stubs `fetch` to throw. The map key is the file
// name, which matches the `source` of the corresponding `assetManifest` entry.
//
// Those bytes (~3.5 MB) make this module far too heavy for the entry chunk, so
// it is only ever loaded through the dynamic `import()` in useProtocolImport.ts
// when someone installs the sample. Vite splits it into its own chunk, which
// the service worker precaches (vite.config.ts) so offline install still works;
// assert-pwa-build.mjs fails the build if it lands in the initial load or
// drops out of the precache. Card metadata lives in sampleProtocol.ts so the
// deck never pulls this module in.
const sampleAssetBytes = import.meta.glob<ArrayBuffer>(
  '../../../../../packages/protocols/sample/assets/*',
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
