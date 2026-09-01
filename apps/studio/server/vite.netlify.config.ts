import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig, type Plugin } from 'vite';

// Netlify Functions bundle. Unlike the Docker bundle (vite.config.ts), which
// leaves npm dependencies external because `pnpm deploy` installs them into
// the image, a function is uploaded on its own — so everything is inlined.

const manifest: unknown = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
);
if (
  typeof manifest !== 'object' ||
  manifest === null ||
  !('version' in manifest) ||
  typeof manifest.version !== 'string'
) {
  throw new Error('package.json has no string version');
}
const version = manifest.version;

/**
 * src/version.ts reads ../package.json at module load, relying on src/*.ts and
 * dist/index.js each sitting one level below the package root. This bundle
 * sits two levels below it (netlify/functions/server.mjs), so that read
 * resolves to a file that does not exist and the function fails at import.
 * Inline the version instead of relaxing the invariant for every runtime.
 */
function inlineVersion(): Plugin {
  const versionModule = fileURLToPath(
    new URL('./src/version.ts', import.meta.url),
  );
  return {
    name: 'studio-inline-version',
    enforce: 'pre',
    load(id) {
      if (id !== versionModule) return null;
      return `export const STUDIO_VERSION = ${JSON.stringify(version)};`;
    },
  };
}

export default defineConfig({
  plugins: [inlineVersion()],
  build: {
    ssr: 'src/netlify.ts',
    outDir: '../netlify/functions',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      external: ['pg-native', 'cloudflare:sockets'],
      output: {
        entryFileNames: 'server.mjs',
        format: 'esm',
        inlineDynamicImports: true,
      },
    },
  },
  ssr: {
    noExternal: true,
  },
});
