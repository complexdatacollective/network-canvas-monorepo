---
'@codaco/fresco-ui': major
---

Surface now derives its visual level from nesting instead of taking a manual `level` prop.

Breaking changes:

- The `level` prop is removed from `Surface`/`MotionSurface`. Each Surface renders one step above the Surface it is mounted inside (via React context, so portalled overlays keep their component-tree position). Depths beyond the token scale clamp to level 3 and warn in development. Remove `level={0..3}` from call sites; if the derived result looks wrong, restructure the layout rather than overriding.
- The `'popover'` level is replaced by a new orthogonal `floating` prop, which applies the popover surface treatment at any depth and restarts the depth ladder for children. Replace `level="popover"` with `floating`.
- `surfaceVariants`' color axis is now `{ depth, floating }`; `depth` is supplied internally by the Surface component and there is no default, so class-level consumers only use `floating`.
- `DataTable` no longer accepts `surfaceLevel`; its table surface derives from context.
- A new `SurfaceDepthReset` export restarts the ladder for floating chrome styled via classes rather than a rendered `<Surface floating>` (used by `DialogPopup`).
- Surface exposes its derived depth to descendants as the `--surface-depth` CSS variable.
