# @codaco/fresco-ui

## 0.1.0

### Minor Changes

- fcfe1aa: Initial release of `@codaco/fresco-ui` — Fresco UI components, styles, and utilities migrated from Fresco's `components/ui/` directory. Tailwind v4 CSS-first; ~96 public exports across primitives, layout, typography, dialogs, dnd, collection, and form subsystems. Pre-1.0; expect breaking changes until the API stabilises.
- Stable initial release. Components, styles, and utilities migrated from Fresco's `components/ui/`. Tailwind v4 CSS-first; ~96 public exports across primitives, layout, typography, dialogs, dnd, collection, and form subsystems.

### Patch Changes

- d678a2a: Expose `./dnd/dnd`, `./form/components/Field/Field`, four form field components (`LikertScale`, `RelativeDatePicker`, `ToggleButtonGroup`, `VisualAnalogScale`), `./form/store/types`, and `./form/utils/ymd`. These are required by Fresco's `useProtocolForm` (relocated to `lib/interviewer/forms/`) and by Fresco code that imported the dnd barrel.
- 5793bf2: Inline the Collection's search Web Worker as a base64 blob URL. The previous build emitted the worker as a separate file at `dist/assets/search.worker-<hash>.js` with an absolute URL that consumers (Next.js, etc.) couldn't resolve. Switching to Vite's `?worker&inline` syntax embeds the worker so it works in any environment.

## 0.1.0-next.2

### Patch Changes

- Inline the Collection's search Web Worker as a base64 blob URL. The previous build emitted the worker as a separate file at `dist/assets/search.worker-<hash>.js` with an absolute URL that consumers (Next.js, etc.) couldn't resolve. Switching to Vite's `?worker&inline` syntax embeds the worker so it works in any environment.

## 0.1.0-next.1

### Patch Changes

- Expose `./dnd/dnd`, `./form/components/Field/Field`, four form field components (`LikertScale`, `RelativeDatePicker`, `ToggleButtonGroup`, `VisualAnalogScale`), `./form/store/types`, and `./form/utils/ymd`. These are required by Fresco's `useProtocolForm` (relocated to `lib/interviewer/forms/`) and by Fresco code that imported the dnd barrel.

## 0.1.0-next.0

### Minor Changes

- fcfe1aa: Initial release of `@codaco/fresco-ui` — Fresco UI components, styles, and utilities migrated from Fresco's `components/ui/` directory. Tailwind v4 CSS-first; ~96 public exports across primitives, layout, typography, dialogs, dnd, collection, and form subsystems. Pre-1.0; expect breaking changes until the API stabilises.
