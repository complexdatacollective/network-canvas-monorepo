import developmentProtocolJson from '@codaco/protocols/development';

import { type BundledProtocol, resolveAssets } from './bundledAssets';

// Isolated into its own module (like bundledSampleProtocol.ts) so the
// Development protocol and its large media — a 23MB video, dev-only — are only
// ever loaded via the dynamic `import()` that useProtocolImport.ts guards with
// `import.meta.env.DEV`. A production build drops that import, so this module
// never reaches its bundle; a static import of it anywhere would put the
// glob's inlined bytes into every build regardless of the DEV guard.
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
