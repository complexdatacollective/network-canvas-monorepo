# fresco-ui — Popover/Tooltip border with arrow integration

**Date:** 2026-05-22
**Author:** Joshua Melville (with Claude)
**Status:** Approved (brainstorming complete)
**Implementation:** see companion plan in `docs/superpowers/plans/`

## 1. Goal

Add a 1px translucent `currentColor` border to fresco-ui's `Popover` and `Tooltip` surfaces, with the arrow visually included in the outline so the border appears to wrap continuously around the popover shape, "speech bubble" style.

## 2. Constraints and decisions (locked in)

| Decision                     | Value                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Border color                 | `currentColor` (resolves to `text-surface-popover-contrast`)                                                          |
| Border intensity             | `border-current/40` — 1px hairline at 40% opacity                                                                     |
| Scope                        | **All popover-level surfaces** — `Popover`, `Tooltip`, `DropdownMenu`, `Combobox`, `DataTableFloatingBar`             |
| Arrow integration            | Split the existing `ArrowSvg` into a fill path (closed) + stroke path (open V outline)                                |
| Stroke crispness             | `vector-effect="non-scaling-stroke"` to stay 1px through the SVG's non-uniform scaling (1.5× horizontal, 2× vertical) |
| Where the border is declared | On `surfaceVariants` for `level: 'popover'` — every `<Surface level="popover">` inherits it automatically             |
| Arrow definition             | Canonical `ArrowSvg` exported from `Popover.tsx`. `Tooltip.tsx` imports it instead of redefining a local copy.        |

## 3. Behaviour

### 3.1 What the user sees

- Every `<Surface level="popover">` renders with a 1px border at 40% of its contrast color. That covers the Popover popup, Tooltip popup, DropdownMenu/SubContent popup, Combobox popup, and DataTableFloatingBar.
- For the arrow-bearing surfaces (Popover, Tooltip), the arrow is outlined on its two sloped sides + apex curve; the outline meets the surface's border line at the arrow's "mouth" with no visible seam. The arrow's interior is filled with `surface-popover`, hiding the segment of the border that the arrow crosses.

### 3.2 What's unchanged

- The animated mount/unmount transitions (motion-driven scale/opacity) on the Surface.
- The `shadow-md` / `shadow-lg` etc. elevation from `surfaceVariants`'s `spacing` axis.
- The token system in `tooling/tailwind` (`--surface-popover`, `--surface-popover-contrast`).
- All other Surface levels (0, 1, 2, 3) — only `popover` gains the border.

## 4. Implementation outline

### 4.1 `packages/fresco-ui/src/layout/Surface.tsx`

Add `border border-current/40` to the `popover` value of `surfaceVariants`'s `level` axis:

```ts
popover:
  'border border-current/40 text-surface-popover-contrast bg-surface-popover',
```

Every consumer of `<Surface level="popover">` (`Popover` → `BaseUISharedPopoverContainer`, `Tooltip` → `MotionSurface`, `DropdownMenu`/`DropdownMenuSubContent` → `BaseUISharedPopoverContainer`, `Combobox`, `DataTableFloatingBar`) inherits the border automatically.

### 4.2 `packages/fresco-ui/src/Popover.tsx`

**ArrowSvg refactor.** Replace the single closed `<path>` with two paths inside the same SVG:

- **Fill path (rendered first):** the existing closed path verbatim, retains `className="fill-surface-popover"`. The base rectangle (viewBox y=8 → y=10) keeps covering the popover's border where the arrow joins.
- **Stroke path (rendered on top):** an _open_ path tracing the V outline only — start at viewBox `(0, 8)`, curve up over the apex at `(~10, 2.6)`, return to `(20, 8)`. Attributes: `fill="none"`, `stroke="currentColor"`, `strokeOpacity={0.4}`, `strokeWidth={1}`, `vectorEffect="non-scaling-stroke"`.

The stroke renders after the fill so it appears on top at the shared V edge.

**Positioning tweak.** Adjust the per-side offsets on the `<BasePopover.Arrow>` wrapper so the stroke endpoints land flush with the popover's border line rather than 2px inside. `data-[side=top]:bottom-[-14px]` becomes `-15px` to match `data-[side=bottom]:top-[-15px]`. Left/right values stay as-is. Exact final values are confirmed in implementation via a visual pass through the Popover storybook.

### 4.3 `packages/fresco-ui/src/Tooltip.tsx`

**ArrowSvg deduplication.** Remove the local `ArrowSvg` definition; import from `./Popover` (which exports it). This is not a re-export — `Popover.tsx` is the canonical source and `Tooltip.tsx` becomes a direct consumer.

**Positioning tweak.** The `TooltipArrow` uses the same `data-[side=…]` offset values as the popover arrow wrapper; mirror the tweak applied in `Popover.tsx`.

## 5. Out of scope

- Configurable border opacity / width as a component prop.
- Border on non-popover Surface levels (0, 1, 2, 3).
- Changes to the `--surface-popover*` tokens themselves.
- Changes to elevation shadows.
- Storybook stories beyond visually verifying the existing Popover/Tooltip/DropdownMenu/Combobox stories.

## 6. Risk / things to watch

- **Pixel alignment.** The biggest implementation hazard is the stroke endpoints meeting the CSS border cleanly on all four sides. With `vector-effect="non-scaling-stroke"` the stroke is 1px regardless of side, but the per-side `bottom-[-Npx]` offsets must be tuned. Visual verification per side is required.
- **`currentColor` consistency.** The CSS border uses Tailwind's `border-current/40` (`color-mix(... transparent)`). The SVG stroke uses `stroke="currentColor" strokeOpacity={0.4}` (simple alpha). The two blending paths are not bit-identical but visually indistinguishable for a hairline. If a future requirement demands exact match, switch the SVG stroke to use a Tailwind utility (`stroke-current stroke-opacity-40` equivalent) — not needed initially.
- **Themed surfaces.** In the interview theme, `--surface-popover` aliases the regular dark surface and `--surface-popover-contrast` follows. The border will track that contrast color correctly; no theme-specific overrides expected.
