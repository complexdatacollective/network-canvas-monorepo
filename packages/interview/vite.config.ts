import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

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

// Posix-normalized absolute path of this package, used by the rollup `external`
// predicate to recognise the package's own files regardless of OS separator.
const pkgRoot = __dirname.replace(/\\/g, '/');

// `@codaco/interface-images` is a private, source-only workspace package (raw
// TSX + generated `.webp` screenshots, never published to npm). It is consumed
// only here — by the stage-navigation menu — so it must be BUNDLED into this
// package's `dist` rather than externalized as a runtime dependency. Posix-
// normalized for the same cross-platform reason as `pkgRoot` above.
const interfaceImagesRoot = resolve(__dirname, '../interface-images').replace(
  /\\/g,
  '/',
);

// Emit the bundled interface-images screenshots as separate hashed files rather
// than base64 data URIs. Vite's lib mode force-inlines every asset — `shouldInline`
// returns `true` for `build.lib` before it ever consults `assetsInlineLimit`, so
// no build setting can override it — which would fold the ~4.5 MB of `.webp` into
// `dist/index.js`. The one per-asset escape that still wins is the `?no-inline`
// query, so tag the manifest's `new URL('./assets/*.webp', import.meta.url)`
// references with it (pre-transform, before Vite resolves the asset URLs). Vite
// strips the query from the emitted reference, so consumers still resolve clean
// `./assets/<name>-<hash>.webp` URLs and the images load on demand.
const interfaceImagesNoInlinePlugin = (): Plugin => ({
  name: 'interview-interface-images-no-inline',
  enforce: 'pre',
  transform(code, id) {
    const p = id.replace(/\\/g, '/');
    if (!p.startsWith(`${interfaceImagesRoot}/`)) return null;
    if (!code.includes('import.meta.url')) return null;
    const tagged = code.replace(
      /(new URL\((['"])[^'"]+?\.webp)\2/g,
      '$1?no-inline$2',
    );
    return tagged === code ? null : { code: tagged, map: null };
  },
  // With a relative `base`, Vite emits the asset reference as a bare
  // `new URL("assets/…", import.meta.url)`. That resolves correctly for
  // esm/Vite consumers, but webpack (Next.js) treats a `new URL()` request
  // without a `./` prefix as a bare module request and fails to resolve it.
  // Re-add the explicit `./` so the emitted references are the canonical,
  // bundler-portable `new URL("./assets/…", import.meta.url)` form. Done in
  // `generateBundle` because Vite only resolves the asset-URL placeholders into
  // their final `new URL("assets/…")` text after the `renderChunk` phase.
  generateBundle(_options, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type === 'chunk' && file.code.includes('new URL("assets/')) {
        file.code = file.code.replaceAll(
          'new URL("assets/',
          'new URL("./assets/',
        );
      }
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
    interfaceImagesNoInlinePlugin(),
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
  // Emit asset URLs relative to the importing module rather than prefixed with
  // the default `/` base. The screenshots are referenced via
  // `new URL('./assets/…', import.meta.url)`, so a relative base keeps them
  // resolvable from wherever a consumer installs `dist/` (e.g.
  // `node_modules/@codaco/interview/dist/`) instead of the server root.
  base: './',
  build: {
    // Bundle to ESM entries rather than `preserveModules`. rolldown's
    // preserveModules rewrites inter-module specifiers from the emitted file
    // paths, and on Windows that leaks source extensions / mismatched paths
    // (e.g. `./Shell.tsx`, unresolved `./Shell.js`), breaking any consumer that
    // bundles `dist/`. Bundled entries build identically across platforms. CSS
    // is unaffected — no JS here imports `.css`; `src/styles.css` is copied
    // verbatim by cssCopyPlugin and consumed via the `./styles.css` export.
    lib: {
      // Two entries: the main (React) public API, and a server-safe `contract`
      // bundle re-exporting only React-free utilities/types. The React code
      // (`Shell`, contexts) is reachable only from `index`, so it never lands
      // in the `contract` bundle — letting server (RSC) code import the
      // contract without evaluating any module-level `createContext`.
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        contract: resolve(__dirname, 'src/contract/index.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      // Bundle only this package's own files; externalize everything else —
      // bare specifiers, other workspace packages, and node_modules — so the
      // consumer provides them. rolldown hands `external` the bare specifier on
      // POSIX but a fully-resolved absolute path on Windows, and that path uses
      // FORWARD slashes (`D:/a/.../src/x.ts`) while node's `__dirname` is
      // back-slashed — so a raw `startsWith(__dirname)` check fails on the
      // separator mismatch, externalizes the package's own modules, and leaks
      // source-extension re-exports into `dist/` (a 2-module stub). Compare on
      // posix-normalized paths so the "resolves inside this package" test holds
      // on both platforms.
      external: (id) => {
        if (id.includes('\0')) return false; // virtual modules: let plugins handle
        if (id.startsWith('.') || id.startsWith('~/')) return false; // relative / src alias
        const p = id.replace(/\\/g, '/');
        if (p.startsWith(`${pkgRoot}/`) && !p.includes('/node_modules/')) {
          return false; // a resolved file inside this package → bundle
        }
        // Bundle the private, source-only interface-images package (its bare
        // specifier and its resolved source/asset files) so this package ships
        // self-contained — it has no publishable npm version to depend on.
        if (
          p === '@codaco/interface-images' ||
          p.startsWith('@codaco/interface-images/')
        ) {
          return false;
        }
        if (
          p.startsWith(`${interfaceImagesRoot}/`) &&
          !p.includes('/node_modules/')
        ) {
          return false;
        }
        return true; // bare specifier / other workspace package / node_modules
      },
      output: {
        // Emit the interface-images screenshots into `dist/assets/` with a
        // content hash, keeping them namespaced and cache-friendly.
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    sourcemap: true,
    minify: false,
  },
});
