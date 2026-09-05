import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { globSync } from 'tinyglobby';
import { defineConfig, type Plugin } from 'vite';
import dts from 'vite-plugin-dts';

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

// Source constructs workers the portable way (`new Worker(new URL(...))`) so
// non-Vite bundlers can consume this package's source. That form is wrong for
// the published dist, where a library-mode worker chunk emits an absolute
// `/assets/<hash>.js` URL consumers cannot resolve — so for the library build
// only, redirect the factory module to its `?worker&inline` twin, which bakes
// the workers into blob URLs. Storybook, Vitest and the e2e host load this
// config too and resolve source directly, so the swap is scoped to `vite build`.
const inlineWorkerPlugin = (): Plugin => ({
  name: 'interview-inline-worker',
  apply: 'build',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !source.endsWith('createAutoLayoutWorker.ts')) return null;
    return resolve(__dirname, 'src/canvas/createAutoLayoutWorker.inline.ts');
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

// `'use client'` is a module-level directive, so bundling drops it: rolldown
// concatenates the modules that declare it into a chunk and nothing survives at
// the top. @codaco/fresco-ui keeps its directives only because it builds with
// `preserveModules` — the trade-off this package deliberately refuses above.
// Without this the published `dist/` hands a Next App Router consumer a bundle
// of React hooks that reads as server code, which is precisely the failure the
// source directives exist to prevent.
//
// Two halves, because neither can do the job alone. The plugin notes which
// modules declared the directive, reading it off the source at `enforce: 'pre'`
// — before the React/oxc pipeline can move or drop it. `banner` then writes it
// back onto every chunk built from at least one of them: rolldown applies a
// banner while rendering the chunk, so the emitted sourcemap shifts with it,
// which editing `chunk.code` in `generateBundle` does not (the map is
// serialized from the render, leaving every mapping a line short).
//
// Deciding per chunk from its constituent modules, rather than by naming
// entries, is what pins the `contract` and `protocol-schema-version` bundles'
// server safety: they stay unmarked only for as long as no module carrying the
// directive is reachable from them, and the moment one is, the emitted file
// says so.
//
// Registered for the library build alone, like `dts` below. Storybook and the
// e2e host bundle this source for a browser, where the directive means nothing;
// with the plugin unregistered nothing is recorded and the banner is inert.
export const createClientDirective = () => {
  const clientModules = new Set<string>();

  const record = (code: string, id: string): void => {
    if (/^\s*(['"])use client\1/.test(code)) {
      clientModules.add(id);
    }
  };

  const banner = (moduleIds: readonly string[]): string =>
    moduleIds.some((id) => clientModules.has(id)) ? "'use client';" : '';

  const plugin: Plugin = {
    name: 'interview-client-directive',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      record(code, id);
      return null;
    },
  };

  return { banner, plugin, record };
};

const clientDirective = createClientDirective();

// Skip dts emission for non-library consumers of this config (Storybook builds
// the preview app; Vitest just runs tests). Storybook's CLI sets STORYBOOK=true;
// Vitest sets VITEST=true.
const isLibraryBuild = !process.env.STORYBOOK && !process.env.VITEST;

const relativeDeclarationSpecifier =
  /\b(from\s+['"]|import\s+['"])(\.{1,2}(?:\/[^'"]*)?)(['"])/g;
const relativeDynamicDeclarationSpecifier =
  /\b(import\(\s*['"])(\.{1,2}(?:\/[^'"]*)?)(['"]\s*\))/g;
const runtimeDeclarationExtension = /\.(?:cjs|css|js|json|mjs)$/;
const directoryDeclarationSpecifier = /^(?:\.{1,2}\/)*\.{1,2}$/;

const appendJsExtension = (specifier: string) => {
  if (directoryDeclarationSpecifier.test(specifier)) {
    return `${specifier}/index.js`;
  }
  return runtimeDeclarationExtension.test(specifier)
    ? specifier
    : `${specifier}.js`;
};

const addJsExtensionsToDeclarationSpecifiers = (content: string) =>
  content
    .replace(
      relativeDeclarationSpecifier,
      (_match, prefix: string, specifier: string, suffix: string) =>
        `${prefix}${appendJsExtension(specifier)}${suffix}`,
    )
    .replace(
      relativeDynamicDeclarationSpecifier,
      (_match, prefix: string, specifier: string, suffix: string) =>
        `${prefix}${appendJsExtension(specifier)}${suffix}`,
    );

export default defineConfig({
  plugins: [
    interfaceImagesNoInlinePlugin(),
    inlineWorkerPlugin(),
    isLibraryBuild && clientDirective.plugin,
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
        insertTypesEntry: true,
        beforeWriteFile: (_filePath, content) => ({
          content: addJsExtensionsToDeclarationSpecifiers(content),
        }),
      }),
    cssCopyPlugin(),
  ],
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
      // Three entries: the main (React) public API, a server-safe `contract`
      // bundle re-exporting only React-free utilities/types, and the standalone
      // protocol schema compatibility constant. The React code (`Shell`,
      // contexts) is reachable only from `index`, so it never lands in the
      // `contract` bundle — letting server (RSC) code import the contract
      // without evaluating any module-level `createContext`. The
      // `protocol-schema-version` entry is its own bundle so a host's Node
      // scripts can import just that constant.
      entry: {
        'index': resolve(__dirname, 'src/index.ts'),
        'contract': resolve(__dirname, 'src/contract/index.ts'),
        'protocol-schema-version': resolve(
          __dirname,
          'src/protocolSchemaVersion.ts',
        ),
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
        // Re-declare the client boundary that bundling erased — see
        // `createClientDirective` above.
        banner: (chunk) => clientDirective.banner(chunk.moduleIds),
      },
    },
    sourcemap: true,
    minify: false,
  },
});
