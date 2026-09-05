---
'@codaco/fresco-ui': patch
---

Stop fields spreading `aria-readonly` onto elements whose role does not allow
it. `useField` injects the attribute into the prop bag every field spreads onto
its element, which is correct for the controls that take it directly, but
`ArrayField` put it on its `role="list"`, `CheckboxGroup`, `ToggleButtonGroup`
and `RadioMatrixField` put it on their `<fieldset>` (implicit `role="group"`),
and `LikertScale` and `VisualAnalogScale` put it on the roleless `<div>` they
wrap their slider in. WAI-ARIA allows `aria-readonly` only on widget roles such
as `textbox`, `checkbox`, `combobox`, `listbox`, `radiogroup`, `slider` and
`spinbutton` — unlike `aria-disabled` and `aria-invalid`, which ARIA 1.2 made
global — so axe reported every one of these as a critical `aria-allowed-attr`
failure, even when the value was `"false"`. That failed the accessibility gate
on any story mounting an array field.

Each of those fields now filters the attribute out before spreading and leaves
the read-only state on the control that owns it: the individual checkboxes and
toggles of a group, the slider of a scale. Text, select and combobox fields are
unaffected and still carry `aria-readonly` themselves.
