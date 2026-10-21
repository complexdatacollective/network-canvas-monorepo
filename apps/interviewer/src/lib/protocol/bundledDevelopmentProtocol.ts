import developmentProtocolJson from '@codaco/protocols/development';

import { type BundledProtocol, resolveAssets } from './bundledAssets';

// Isolated into its own module (like bundledSampleProtocol.ts) so the
// Development protocol's large media — a 23MB video, dev-only — is only ever
// loaded via the dynamic `import()` in useProtocolImport.ts's
// `import.meta.env.DEV` branch. A static import of this module, or an
// `import()` outside that branch, would put the glob's inlined bytes into the
// production build; behind it, production drops the module entirely (checked
// by scripts/assert-pwa-build.mjs).
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
