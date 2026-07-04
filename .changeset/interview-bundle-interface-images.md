---
'@codaco/interview': patch
---

Bundle the private `@codaco/interface-images` package into the build instead of externalizing it, fixing an uninstallable published package.

`@codaco/interface-images` is a private, source-only workspace package (raw TSX + generated `.webp` screenshots, `version: 0.0.0`, never published to npm) consumed only by the stage-navigation menu. The Vite `external` predicate treated it like a publishable peer and externalized it, so the published `dist/index.js` carried a bare `import '@codaco/interface-images/…'` and `package.json` listed it as a runtime dependency (`workspace:*`, rewritten to `0.0.0` at publish). Because that version does not exist on npm, `pnpm add @codaco/interview` failed with `ERR_PNPM_FETCH_404` for `@codaco/interface-images`.

The build now bundles the interface-images source into `dist/index.js` and emits its ~4.5 MB of `.webp` screenshots as separate hashed files under `dist/assets/` (referenced via `new URL('./assets/…', import.meta.url)`, keeping `dist/index.js` small and letting the images load on demand), and the package is reclassified as a `devDependency`, so the published package is self-contained with no dangling runtime dependency. No runtime or type API changes.
