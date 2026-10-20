// Bundles netlify/functions/*.mts into netlify/.bundled for deployment.
//
// Netlify packages V2 functions with nft, which keeps every package import
// external and ships the package's traced files. Workspace packages export raw
// TypeScript (`@codaco/protocol-validation` → `src/index.ts`), which nft does
// not follow, so the deployed function fails with ERR_MODULE_NOT_FOUND.
// Bundling everything here, and deploying with `node_bundler = "none"`,
// leaves Netlify nothing to resolve. `netlify dev` still serves the source
// directory (`[dev] functions` in netlify.toml).
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const appDir = fileURLToPath(new URL('..', import.meta.url));
const outdir = fileURLToPath(new URL('../netlify/.bundled', import.meta.url));

await rm(outdir, { recursive: true, force: true });

await build({
  absWorkingDir: appDir,
  entryPoints: ['netlify/functions/*.mts'],
  outdir,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Bundled CommonJS dependencies call require() for Node built-ins.
  banner: {
    js: "import { createRequire as __sketchCreateRequire } from 'node:module'; const require = __sketchCreateRequire(import.meta.url);",
  },
  logLevel: 'warning',
});
