---
'@codaco/fresco-ui': minor
---

Move `immer` from `peerDependencies` to `dependencies`. Hosts no longer need to declare `immer` themselves; fresco-ui now ships its own resolved version. Internal use is limited to `enableMapSet()` in the form store, and pnpm catalog/overrides keep the version aligned with `@codaco/interview`'s and any transitives (`@reduxjs/toolkit`, `zustand`).

Also: drop `--color-` prefixes from a handful of `bg-[--…]` arbitrary values; tailwind-config alpha.16 now exposes the bare semantic tokens via `@theme inline`, and the `--color-*` indirection no longer flows through to scoped themes.
