import developmentProtocolJson from '@codaco/protocols/development';

import { type BundledProtocol, resolveAssets } from './bundledAssets';

// Isolated into its own module (rather than living alongside the Sample
// protocol in bundledProtocols.ts) so the Development protocol's large media
// — a 23MB video, dev-only — is only ever loaded via the dynamic `import()`
// in useProtocolImport.ts's `import.meta.env.DEV` branch. A static top-level
// import here would bundle the glob's inlined bytes into every build
// regardless of the DEV guard; splitting the module lets Vite code-split it
// into a chunk production never fetches.
const developmentAssetBytes = import.meta.glob<ArrayBuffer>(
  '../../../../../packages/protocols/development/assets/*',
  { query: '?arraybuffer', import: 'default', eager: true },
);

export function loadBundledDevelopmentProtocol(): Promise<BundledProtocol> {
  const document: unknown = developmentProtocolJson;
  return Promise.resolve({
    document,
    assets: resolveAssets(document, developmentAssetBytes),
    name: 'Development Protocol',
  });
}
