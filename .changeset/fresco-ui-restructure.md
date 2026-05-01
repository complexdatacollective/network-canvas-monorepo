---
'@codaco/fresco-ui': minor
---

Restructure the package's public surface and build setup. The public API is unchanged in behaviour, but several import paths have moved and the Tailwind theme now lives in a separate package.

Changes:

- **Tailwind theme moved to `@codaco/tailwind-config`.** The Fresco theme tokens, colour palette, and Tailwind plugins (elevation, inset-surface, motion-spring) are now hosted by `@codaco/tailwind-config` under the `./fresco/*` subpaths. The Nunito font is now loaded from there as well. `@codaco/fresco-ui` re-consumes them internally.
- **Component file names standardised to PascalCase.** The lowercase files (`badge`, `dropdown-menu`, `popover`, `skeleton`, `table`, `tooltip`) and their corresponding subpath exports have been renamed.
- **`form/components/` flattened to `form/`.** Field components are now imported one level shallower.
- **`nuqs` is no longer a peer dependency.** Components that previously read URL state via `nuqs` now expose controlled `value`/`onChange` APIs, so consumers are free to wire up any state source.
- **Storybook interaction tests.** A Vitest browser-mode project (Playwright + Chromium) now runs the Storybook play functions in CI.
- **Build internals.** `exports.config.ts` and the build-exports script have been removed — `package.json#exports` is now the single source of truth. Externals are declared inline via regex (replacing `vite-plugin-externalize-deps`). Vite plugins, including `@vitejs/plugin-react` v6, are on their latest releases.

Migration:

- `import … from '@codaco/fresco-ui/badge'` → `'@codaco/fresco-ui/Badge'`
- `import … from '@codaco/fresco-ui/dropdown-menu'` → `'@codaco/fresco-ui/DropdownMenu'`
- `import … from '@codaco/fresco-ui/popover'` → `'@codaco/fresco-ui/Popover'`
- `import … from '@codaco/fresco-ui/skeleton'` → `'@codaco/fresco-ui/Skeleton'`
- `import … from '@codaco/fresco-ui/table'` → `'@codaco/fresco-ui/Table'`
- `import … from '@codaco/fresco-ui/tooltip'` → `'@codaco/fresco-ui/Tooltip'`
- `import … from '@codaco/fresco-ui/form/components/<X>'` → `'@codaco/fresco-ui/form/<X>'`
- Theme/colour CSS imports move from `@codaco/fresco-ui/styles.css` add-ons to `@codaco/tailwind-config/fresco/theme.css` and `@codaco/tailwind-config/fresco/colors.css`.
- Drop `nuqs` from peer dependencies; pass controlled state into the affected components instead.
