import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { globSync } from 'tinyglobby';
import { defineConfig, type Plugin } from 'vite';
import dts from 'vite-plugin-dts';

import pkg from './package.json' with { type: 'json' };

// Tailwind v4 source CSS (`@source` directives, `@theme`, etc.) is meant to
// reach the consumer's Tailwind compile untouched — routing it through Vite's
// PostCSS pipe risks stripping or rewriting the directives. Mirror the
// approach in @codaco/fresco-ui and @codaco/tailwind-config: copy each
// `src/**/*.css` file verbatim into `dist/`.
const cssCopyPlugin = (): Plugin => ({
  name: 'interview-css-copy',
  async closeBundle() {
    const here = __dirname;
    const files = globSync(['src/**/*.css'], { cwd: here });
    for (const rel of files) {
      const out = rel.replace(/^src\//, 'dist/');
      const absOut = resolve(here, out);
      await mkdir(dirname(absOut), { recursive: true });
      await copyFile(resolve(here, rel), absOut);
    }
  },
});

// Skip dts emission for non-library consumers of this config (Storybook builds
// the preview app; Vitest just runs tests). Storybook's CLI sets STORYBOOK=true;
// Vitest sets VITEST=true.
const isLibraryBuild = !process.env.STORYBOOK && !process.env.VITEST;

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    react(),
    isLibraryBuild &&
      dts({
        entryRoot: 'src',
        include: ['src/**/*.ts', 'src/**/*.tsx'],
        exclude: [
          'src/**/*.test.ts',
          'src/**/*.test.tsx',
          'src/**/*.stories.tsx',
        ],
        compilerOptions: { rootDir: resolve(__dirname, 'src') },
        bundleTypes: true,
      }),
    cssCopyPlugin(),
  ],
  define: {
    __PACKAGE_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    // Bundle to a single ESM entry rather than `preserveModules`. rolldown's
    // preserveModules rewrites inter-module specifiers from the emitted file
    // paths, and on Windows that leaks source extensions / mismatched paths
    // (e.g. `./Shell.tsx`, unresolved `./Shell.js`), breaking any consumer that
    // bundles `dist/`. A single bundle has no inter-module specifiers to rewrite
    // and so builds identically across platforms. CSS is unaffected — no JS here
    // imports `.css`; `src/styles.css` is copied verbatim by cssCopyPlugin and
    // consumed via the `./styles.css` export.
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      // Bundle only this package's own files; externalize everything else —
      // bare specifiers, other workspace packages, and node_modules — so the
      // consumer provides them. rolldown hands `external` the bare specifier on
      // POSIX but a fully-resolved absolute path on Windows; a prefix-only
      // `.`/`/` check misclassifies a resolved Windows path
      // (`D:\...\src\x.ts`) as external, which silently un-bundles the whole
      // package and leaks source-extension imports into `dist/`. Keying on
      // "resolves inside this package directory" is correct on both platforms.
      external: (id) => {
        if (id.includes('\0')) return false; // virtual modules: let plugins handle
        if (id.startsWith('.') || id.startsWith('~/')) return false; // local source
        if (isAbsolute(id) && id.startsWith(__dirname)) return false; // resolved into this package
        return true; // bare specifier / other package / node_modules
      },
    },
    sourcemap: true,
    minify: false,
  },
});
