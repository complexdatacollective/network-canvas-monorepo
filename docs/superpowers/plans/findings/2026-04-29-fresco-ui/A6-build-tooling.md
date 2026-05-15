# A6 — Build tooling verification (Vite 8 + Rolldown + vite-plugin-dts)

**Verified**: 2026-04-30
**Vite**: 8.0.x (released 2026-03-12)
**Rolldown**: shipped inside `vite@8` (no separate peer install required)
**vite-plugin-dts**: 5.0.0 (released 2026-04-30; wraps `unplugin-dts@1.0.0`)

Sources cited inline; see end of document for the full URL list.

---

## 1. `rolldownOptions` vs `rollupOptions`

**Canonical name**: `build.rolldownOptions`. Use this in new code.

The Vite 8 migration guide states the option was renamed:

> `build.rollupOptions`: renamed to `build.rolldownOptions`

The Vite 8 build-options reference confirms `rollupOptions` survives only as a deprecated alias:

> This option is an alias of `build.rolldownOptions` option. Use `build.rolldownOptions` option instead.

Worker config got the same treatment: `worker.rollupOptions` → `worker.rolldownOptions`.

**Compat layer behaviour**. Vite 8 ships an auto-conversion layer rather than a pure pass-through. The release blog says:

> We built a compatibility layer that auto-converts existing `esbuild` and `rollupOptions` configuration to their Rolldown and Oxc equivalents, so many projects will work without any config changes.

Practical implications for Task B7:

- Use `build.rolldownOptions` directly — no warning, no translation step, no risk of silent semantic drift.
- Do **not** use `output.manualChunks` (object form removed; function form deprecated) — prefer Rolldown's `codeSplitting` option if chunk control is needed. (Not required for `@codaco/fresco-ui` since it's a library build.)
- `optimizeDeps.esbuildOptions` is also deprecated in favour of `optimizeDeps.rolldownOptions` (irrelevant for a library, but noted).

---

## 2. `preserveModules` status in Rolldown

**Status as of 2026-04-30: SHIPPED and stable.**

The tracking issue (rolldown/rolldown#2622) was closed on **2025-05-19** via PR #4457 (`sxzz`: "Done via #4457"). The "on hold: awaiting more feedback" label was removed when the team reprioritised it in April 2025; the implementation landed a month later.

Both options are documented in the Rolldown reference and are not flagged experimental:

- **`output.preserveModules`** — `boolean`, default `false`. From the docs: "Whether to use preserve modules mode. Instead of creating as few chunks as possible, this mode will create separate chunks for all modules using the original module names as file names." Tree-shaking still applies: "suppressing files that are not used by the provided entry points or do not have side effects … and removing unused exports of files that are not entry points."
- **`output.preserveModulesRoot`** — `string`, optional. From the docs: "A directory path to input modules that should be stripped away from `output.dir` when using preserve modules mode." Example: with `input: ['src/foo.ts']`, `output.dir: 'dist'`, `preserveModulesRoot: 'src'`, the file emits to `dist/foo.js`.
- **Combining with `entryFileNames`/`chunkFileNames`** is supported (confirmed by Rolldown maintainer `sxzz` on the issue thread, 2025-06-25): you can change extensions, but you must set both `entryFileNames` and `chunkFileNames` together.

**Decision for fresco-ui**: use `preserveModules: true` with `preserveModulesRoot: 'src'`. This produces a tree-shake-friendly multi-file output without having to enumerate per-component entries — important for the package's goal of allowing consumers to subpath-import individual components.

No multi-entry fallback is needed.

---

## 3. `vite-plugin-dts` compatibility with Vite 8 / Rolldown

**Recommended dependency**: `vite-plugin-dts@^5.0.0`.

**Recency check**:

- `5.0.0` published **2026-04-30** (yesterday) — explicitly the post-Vite-8 release.
- Eight `5.0.0-beta.*` releases shipped between 2025-05-18 and 2025-07-31 covering the beta/RC Vite 8 cycle.
- The package is now a thin wrapper around `unplugin-dts@1.0.0` (also released 2026-04-30), giving it Vite 8, Rollup, Webpack, Rspack, and Rolldown support from a single core.

**Peer deps** for `vite-plugin-dts@5.0.0`:

```json
{
  "@microsoft/api-extractor": ">=7", // optional
  "rollup": ">=3", // optional
  "vite": ">=3" // optional
}
```

All three are optional, and `vite: ">=3"` admits Vite 8 cleanly.

**Rolldown compat caveats**: Rolldown advertises Rollup-plugin-API parity ("Rolldown supports the same plugin API as Rollup and Vite. Most existing Vite plugins work out of the box with Vite 8."). User reports on `vitejs/rolldown-vite` discussions confirm `vite-plugin-dts` produces correct `.d.ts` output under the rolldown-vite preview during the v7 cycle, with the bundle step actually faster (one report: 10.5s → 7.8s).

**Fallback plan** (not expected to be needed): if `vite-plugin-dts@5` regresses for our setup, run `tsc --emitDeclarationOnly --declarationMap -p tsconfig.build.json` as a separate pnpm script and let Vite emit only `.js`. This keeps the plan unblocked.

---

## 4. Recommended `vite.config.ts` snippet for Task B7

```ts
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    react(),
    dts({
      entryRoot: 'src',
      outDir: 'dist',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.stories.tsx', 'src/**/*.test.{ts,tsx}'],
      // unplugin-dts copies tsconfig settings, so declarationMap follows tsconfig.
      tsconfigPath: 'tsconfig.build.json',
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false, // libraries should not minify; let consumers do it
    cssCodeSplit: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'], // ESM-only; consumers run a modern bundler
    },
    rolldownOptions: {
      // Keep peer deps external. React/JSX runtime are the bare minimum;
      // extend this list in B7 once package.json peerDependencies are finalised.
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        /^@radix-ui\//,
        /^@codaco\//,
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
        // chunkFileNames only matters if Rolldown still emits shared chunks
        // alongside preserved modules (e.g. for code-split CSS); keep it
        // explicit so the extension stays stable.
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
```

**Notes for the B7 implementer**:

- The config uses `rolldownOptions` directly (Section 1) — no need to rely on the `rollupOptions` compat alias.
- `preserveModules` + `preserveModulesRoot: 'src'` (Section 2) gives one output file per source module, mirroring the `src/` tree under `dist/`. This makes deep imports (`@codaco/fresco-ui/components/Button`) work without explicit per-component entries and lets consumer bundlers tree-shake at module granularity.
- `vite-plugin-dts@^5.0.0` (Section 3) emits `.d.ts` files alongside the `.js` files using the same module layout. `tsconfigPath` should point at a `tsconfig.build.json` that sets `declaration: true`, `declarationMap: true`, `emitDeclarationOnly: false`, and excludes test/story files.
- `external` must list every runtime peer dep. Check `package.json` `peerDependencies` is the source of truth in B7 and consider auto-deriving the `external` list from it.
- `formats: ['es']` is intentional — fresco-ui targets a modern Next.js consumer. If a CJS build is needed later, add `'cjs'` and configure `output` as an array; under `preserveModules` Rolldown will emit two parallel trees.

---

## Sources

- Vite 8 migration guide — <https://vite.dev/guide/migration>
- Vite 8 build options reference — <https://vite.dev/config/build-options>
- Vite 8 release blog — <https://vite.dev/blog/announcing-vite8>
- Rolldown `preserveModules` reference — <https://rolldown.rs/reference/outputoptions.preservemodules>
- Rolldown `preserveModulesRoot` reference — <https://rolldown.rs/reference/outputoptions.preservemodulesroot>
- Rolldown issue #2622 (closed 2025-05-19) — <https://github.com/rolldown/rolldown/issues/2622>
- Rolldown PR #4457 (the implementation) — <https://github.com/rolldown/rolldown/pull/4457>
- vite-plugin-dts on npm (5.0.0 published 2026-04-30) — <https://www.npmjs.com/package/vite-plugin-dts>
- unplugin-dts 1.0.0 release notes — <https://github.com/qmhc/unplugin-dts/releases/tag/unplugin-dts@1.0.0>
- rolldown-vite discussion #474 (vite-plugin-dts under Rolldown) — <https://github.com/vitejs/rolldown-vite/discussions/474>
