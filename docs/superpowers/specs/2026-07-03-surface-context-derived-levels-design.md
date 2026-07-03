# Surface: context-derived levels

**Date:** 2026-07-03
**Status:** Approved
**Packages:** `@codaco/fresco-ui` (breaking), `@codaco/interview`, `apps/interviewer-v8`, `apps/architect-web`; Fresco (external consumer, migrates on version bump)

## Problem

`Surface` (`packages/fresco-ui/src/layout/Surface.tsx`) is the core building
block for panels and sections. Its visual treatment must change with nesting
depth so that stacked surfaces remain distinguishable, but today that depth is
communicated manually via a `level: 0 | 1 | 2 | 3 | 'popover'` prop. Manual
levels drift: callers must know where their component will be mounted, most
call sites just say `level={1}` ("one above wherever I am"), and moving a
component to a different nesting context silently renders it with the wrong
tokens. Surface should derive its level from where it actually renders.

## Decisions (settled during brainstorming)

1. **Strictly derived.** The `level` prop is removed entirely. Depth in the
   Surface component tree is the single source of truth for the 0–3 ladder.
   No override or relative-adjustment escape hatch. Layouts that look wrong
   under derivation are fixed by restructuring (adding/removing a Surface),
   never by reintroducing overrides.
2. **Warn and clamp beyond the scale.** Depth 4+ renders with the level-3
   tokens; a dev-only warning fires so accidental over-nesting is surfaced
   during development instead of silently flattening.
3. **Popover treatment becomes `floating` + depth reset.** A new orthogonal
   `floating?: boolean` prop applies the popover tokens regardless of depth
   and restarts the depth ladder for children, so surfaces inside an overlay
   derive from the overlay base, not from wherever the trigger sat. The
   floating surface acts as the depth-0 base of its subtree: its direct
   Surface children render depth 1 (a literal depth-0 child would render
   `--surface` against `--surface-popover`, which are near-identical in the
   default theme).

## Design

### Mechanism: React context depth counter

A `SurfaceDepthContext` (plain `number`, default `0`) lives with Surface.
Each Surface:

1. Reads the inherited depth.
2. Renders the tokens for `min(depth, 3)` — the existing `--surface`,
   `--surface-1..3` (+ matching `-contrast`) tokens, unchanged.
3. Dev-warns once per instance when `depth > 3`.
4. Provides `depth + 1` to its children.
5. Sets `--surface-depth: <n>` inline so descendant CSS can react to depth
   (mirrors the `--published-bg` precedent from the elevation plugin).

React context is the mechanism because it survives portals — a Dialog or
Popover rendered into `document.body` keeps its React-tree position — and
because CSS-only depth counting is not viable (a custom property cannot
reference itself; descendant-selector ping-pong hacks break across portals
and cannot warn). The theme layer is untouched: themes keep defining the four
discrete tokens, and elevation's `--published-bg` shadow tinting keeps
working because Surface still emits `publish-colors` + `bg-surface-*`.

### API

- `level` is deleted from `SurfaceVariants` and `SurfaceProps`. No
  deprecation alias or fallback.
- `floating?: boolean` — popover tokens (`bg-surface-popover`,
  `text-surface-popover-contrast`, `border-2`) regardless of depth; children
  restart the ladder from the floating base (direct children render depth 1).
- `spacing`, `shadow`, `section`, `as`, `noContainer`, `maxWidth`,
  `baseSize` unchanged. `MotionSurface` unchanged.
- The first Surface in a tree renders depth 0 (`--surface`) — identical to
  today's default.

### `surfaceVariants` (class-level consumers)

The cva's color axis becomes `{ depth: 0 | 1 | 2 | 3, floating: boolean }`.
It stays exported for the few places that style non-Surface elements, but
`depth` is supplied only by the Surface component itself; external
class-level use is limited to `floating`:

- **DialogPopup** (currently `level: 0`): switches to `floating`, and
  additionally renders the depth-0 provider around its children so Surfaces
  nested in dialogs derive correctly.
- **ScaleValuePopover** (currently `level: 'popover'`): `floating`.
- **ArrayField** (currently `surfaceVariants({ level: 1 })` chips): migrates
  to render an actual `<Surface>` so chips derive from context.

### Migration

- Monorepo: ~25 `level={...}` call sites drop the prop; `level="popover"`
  sites (Popover, Tooltip, Combobox, DataTableFloatingBar) become
  `floating`.
- Fresco (`~/Projects/fresco-next`, separate repo): ~6 call sites, same
  treatment, applied when it takes the new published version.
- fresco-ui gets a **major-bump changeset**.

Strict derivation changes some rendered colors — anywhere that jumps
straight to `level={2|3}`, or renders `level={1}` siblings inside an
already-level-1 parent, now renders one step different. This is intended,
but requires a visual audit: Storybook/Chromatic for fresco-ui and interview
stories, plus a screenshot sweep of affected interview interfaces and app
screens. Discrepancies are fixed by restructuring layouts.

### Testing

- Co-located vitest units: nesting renders `bg-surface` → `bg-surface-1` →
  `-2` → `-3`; depth 4+ clamps and warns (dev only); `floating` applies
  popover tokens and resets children to depth 0; portal-rendered children
  keep tree depth.
- Stories: `DifferentLevels` replaced by a nested-derivation story plus a
  floating-reset story.

## Out of scope

- Continuous (formula-driven) surface colors beyond the four tokens.
- Migrating raw `bg-surface-*` utility usage on plain elements — those never
  participated in `level` and are unaffected.
- Any change to theme token definitions.
