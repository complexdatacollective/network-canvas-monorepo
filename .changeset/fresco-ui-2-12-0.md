---
'@codaco/fresco-ui': minor
---

New `RadioMatrixField` at `./form/fields/RadioMatrixField`: a form field that
asks the same single-choice question across many rows, laid out as a matrix
(rows × shared option columns). Each row is an independent radio group; the field
value is an array of `{ id, value }` entries, with an optional `defaultOption`
pre-selected for unanswered rows. It uses the standard input-control container and
collapses to stacked per-row groups on narrow containers. `RadioItem` gains
optional `className` / `labelClassName` props so callers can place a bare radio in
a grid cell.

Field rendering tweaks:

- `BaseField` now uses a uniform `not-last:mb-8` bottom margin between fields
  instead of ramping the gap up on larger screens
  (`tablet-landscape:not-last:mb-8`, `desktop:not-last:mb-10`), giving form
  fields a consistent vertical rhythm across all breakpoints.
- `Label` no longer carries the heading `label` variant's default bottom
  margin (`margin: 'none'`), so field labels sit tighter to their control.
- `InputField` number steppers now use a subtle contrast-tinted hover
  (`hover:bg-input-contrast/10`) instead of switching to the accent color.

`DropdownMenuContent` now renders the same pointer arrow as `Popover`. It
gained a `showArrow` prop (defaulting to `true`) that draws the shared
`ArrowSvg` with per-side rotation, and its default `sideOffset` increased from
`4` to `10` so the arrow clears the trigger.
