# Responsive label rendering for `VisualAnalogScale` & `LikertScale`

**Date:** 2026-06-30
**Status:** Approved — implementing
**Package:** `@codaco/fresco-ui`

## Problem

The `VisualAnalogScale` (VAS) and `LikertScale` form fields render a slider
track plus a row of anchor/option labels beneath it. The track is responsive,
but the **labels are not**: their footprint is unbounded in both axes, so under
constraint they fail in two ways.

1. **Horizontal clip (Likert).** Labels sit in a fixed grid
   (`0.5fr repeat(n-2, 1fr) 0.5fr`). The cells have no `min-width: 0`, so a
   column cannot shrink below its longest word ("Strongly", "disagree"). With
   4–5 anchors in a narrow column the row's min-content exceeds the container and
   the **end labels are clipped** — the reported bug.
2. **Vertical growth.** When the words do wrap, the label row grows taller and
   pushes content out of a short field slot (e.g. landscape phones/tablets in the
   interview runtime, the binding context).

VAS has only two anchor labels (capped at `max-w-24`) so it cannot clip
horizontally, but it shares the vertical-growth problem.

## Goal

Keep the labels readable and on-screen at any viewport, prioritising the scarce
vertical axis, without changing the validated instruments more than necessary.

## Design

### Likert: a measured three-tier label ladder

The label row degrades only as far as the available space forces it. Because the
**active value always rides the thumb in a drag popover** (below), the label row
is demoted to _scale context_ and can degrade hard without ever losing the
participant's current selection.

1. **Full** — labels in the existing grid, hardened so they _cannot_ clip:
   columns become `minmax(0, …fr)` (allowing shrink), labels get
   `overflow-wrap`/word-break and a small text-size floor. They wrap instead of
   overflowing. Label-to-tick alignment (first left, last right, middle centred)
   is preserved by keeping the `0.5fr … 0.5fr` column structure.
2. **Rotated (clockwise 45°)** — used only when wrapping is insufficient, i.e.
   when a label's longest _word_ still exceeds its cell width (a word cannot wrap
   narrower than itself) or a label would need more than two lines. Each label is
   **centred on its tick** (`transform-origin: center`; positioned so its
   midpoint sits over the mark) and rotated **clockwise**. The control gains
   symmetric horizontal padding equal to the rotated overhang so the centred end
   labels do not clip; the label band and the track share that padding so tick
   alignment is preserved.
3. **Anchors only** — used when the predicted rotated band height exceeds the
   vertical budget. Shows just the two end anchors (like VAS). The drag popover
   still carries the chosen value.

### Switch trigger — measure actual fit

A single measurement pass, re-run on resize and on label/rem change:

- A hidden, `aria-hidden` measurement layer renders two probes per label: a
  `white-space: nowrap` span (→ single-line `fullWidth`) and a
  `width: min-content` span (→ `longestWordWidth`). Probes inherit the label
  font.
- A 1rem sentinel observed by `ResizeObserver` invalidates the measurement when
  the root font-size changes (late-loading theme CSS), mirroring
  `useMeasureItems`.
- A `ResizeObserver` on the control reports `availableWidth`.
- A **pure** `decideScaleLabelTier({ availableWidth, optionCount, labels,
maxLabelHeight, viewportHeight })` returns `'full' | 'rotated' | 'anchors'`.
  Width (per-label cell width, with the half-width end cells as the binding
  constraint) drives full→rotated; a vertical budget drives rotated→anchors.
- The `ResizeObserver` callback is **stable** (refs, not deps) and only calls
  `setState` when the tier actually changes — avoiding the known interview
  effect-dep render loops.

**Vertical budget.** `maxLabelHeight` defaults to a viewport-derived value
(`clamp(64px, 20vh, 140px)` evaluated in JS) so the band budget shrinks on short
screens (pushing to anchors) and relaxes on tall ones. An explicit
`maxLabelHeight` prop overrides it (used by stories to force a tier).

### Drag popover (both fields)

A lightweight value label, shown **only during active adjustment** (pointer drag,
or while the slider input is focused and its value is changing) and hidden at
rest:

- Pinned to base-ui's `--slider-thumb-position` (the same mechanism the thumb
  uses), offset **above** the thumb so a finger does not cover it on touch.
- Appears with a spring, gated on `useReducedMotion()`.
- Not a focus-trapping `Popover`/`Tooltip` — it is a positioned, non-interactive
  element, so it adds no tab stop and no portal.
- **Likert** shows the current option's label.
- **VAS** shows the current value: a rounded percentage for the default
  normalised `0–1` scale, otherwise the value in the field's own units (e.g.
  `5` on a `0–10` range). It is transient, so no persistent number anchors the
  participant.

### VAS specifics

Two anchors only ⇒ never rotates and never collapses to "anchors" (it already
is). It receives the never-clip hardening (the two anchors keep `max-w-24`,
gain `overflow-wrap`) and the drag-only popover.

### Accessibility & i18n

- Labels stay real text; rotation is a CSS transform only, so DOM order and the
  reading order for assistive tech are unchanged.
- A visually-hidden `aria-live="polite"` region announces the current value on
  change (Likert: option label). Discrete option changes are coarse enough not
  to flood the screen reader; VAS keeps the native slider input's announcement.
- The thumb keeps its descriptive `aria-label`. The slider remains fully
  keyboard operable (existing Enter/Space pristine-commit and arrow handling are
  preserved unchanged).
- Whole, externalisable label strings (no fragment concatenation). Rotation and
  wrapping both tolerate text expansion. Rotation direction mirrors under
  `dir="rtl"`.

## Components & files (`packages/fresco-ui`)

- `styles/controlVariants.ts` — add rotated-label and value-popover style
  variants; switch Likert grid columns to `minmax(0, …)`; add `overflow-wrap`
  to label variants.
- `form/fields/scale/decideScaleLabelTier.ts` — pure decision function (unit
  tested).
- `form/fields/scale/useScaleLabelLayout.tsx` — measurement hook returning the
  active tier and the hidden measurement node.
- `form/fields/scale/ScaleValuePopover.tsx` — the drag-time value bubble.
- `form/fields/LikertScale.tsx` — consume the ladder + popover + live region.
- `form/fields/VisualAnalogScale.tsx` — never-clip hardening + popover + live
  region.
- Stories updated to force each tier (narrow width, long labels) and exercise
  the drag popover; new interaction/`aria-live` assertions; existing
  keyboard/commit tests preserved.

Nothing outside `fresco-ui` changes; the interview consumes these through `Form`
fields unchanged.

## Testing

- **Unit (Vitest):** `decideScaleLabelTier` truth table — fits-single-line,
  wraps-cleanly, long-word→rotated, tall-band→anchors, n≤2 edge cases,
  unmeasured (width 0) → full.
- **Storybook:** stories per tier (forced via container width + `maxLabelHeight`
  - long-label sets); drag-popover visibility (appears on drag, hidden at rest);
    `aria-live` content updates; existing keyboard/commit interaction tests
    retained.
- **Visual:** confirm each tier against the rendered stories (not just jsdom),
  per project practice.

## Out of scope

- Changing the underlying data model (VAS normalised `0–1`, Likert option
  values) — unchanged.
- Architect-web's own Likert/Slider editors — unchanged.
