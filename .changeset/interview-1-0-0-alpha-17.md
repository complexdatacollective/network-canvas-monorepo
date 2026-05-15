---
'@codaco/interview': prerelease
---

Move `immer` from `peerDependencies` to `dependencies`. Hosts no longer have to declare `immer` themselves — interview ships its own resolved version (catalog `^11.1.4`, aligned with fresco-ui and the workspace `@reduxjs/toolkit` / `zustand` transitives via a `pnpm.overrides` entry). The single-instance contract that `enableMapSet()` and Draft tracking rely on is preserved; consumers just don't have to opt in.

Also bundles the trash-bin icon with the package: `NodeBin` no longer references `bg-[url(/images/node-bin.svg)]` (which required consumers to serve the asset themselves) and instead imports the SVG via Vite, which inlines it as a data URI on a sibling JS module. Consumers can drop their `public/images/node-bin.svg` copies on upgrade.

Adds the `publish-colors` utility (from `@codaco/tailwind-config@1.0.0-alpha.16`'s elevation plugin) to `Shell`'s `<main>` element so semantic color tokens flow through to descendants under the scoped interview theme. Drops `--color-` prefixes from a handful of arbitrary `bg-[--…]` values now that tailwind-config alpha.16 exposes bare semantic tokens via `@theme inline`.
