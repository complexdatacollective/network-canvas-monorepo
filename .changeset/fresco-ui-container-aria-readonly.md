---
'@codaco/fresco-ui': patch
---

Stop fields spreading `aria-readonly` and `aria-required` onto elements whose
role does not allow them. `useField` injects both into the prop bag every field
spreads onto its element, which is correct for the controls that take them
directly, but `ArrayField` put them on its `role="list"`, `CheckboxGroup`,
`ToggleButtonGroup` and `RadioMatrixField` on their `<fieldset>` (implicit
`role="group"`), and `LikertScale` and `VisualAnalogScale` on the roleless
`<div>` they wrap their slider in and on Base UI's `Slider.Root`, which is
itself a `role="group"` wrapper rather than the slider. ARIA 1.2 made
`aria-disabled` and `aria-invalid` global attributes, so those are valid
anywhere and are unchanged, but `aria-readonly` and `aria-required` are allowed
only on the roles that support them — `textbox`, `checkbox`, `combobox`,
`listbox`, `radiogroup`, `slider`, `spinbutton` and friends — so axe reported
every one of these as a critical `aria-allowed-attr` failure, even when the
value was `"false"`. That failed the accessibility gate on any story mounting
an array field, a checkbox or toggle group, a radio matrix or a scale.

Each of those fields now filters both attributes out before spreading and
leaves the state on the control that owns it: the individual checkboxes and
toggles of a group, each row's radio group in a matrix. Where no element in the
field can legally carry them, the state is exposed the way it already was to
sighted users and screen readers alike — the required marker on the field's
label and the visually hidden "Required" element named in `aria-describedby`,
and, for read-only, the suppressed affordances and handlers. Text, select and
combobox fields are unaffected and still carry both attributes themselves.
