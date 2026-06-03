---
'@codaco/fresco-ui': patch
---

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
