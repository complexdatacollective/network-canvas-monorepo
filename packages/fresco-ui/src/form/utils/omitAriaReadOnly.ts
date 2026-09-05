/**
 * `aria-readonly` is only allowed on the roles WAI-ARIA lists as supporting
 * it: `textbox`, `checkbox`, `combobox`, `grid`, `gridcell`, `listbox`,
 * `radiogroup`, `slider` and `spinbutton`. Unlike `aria-disabled` and
 * `aria-invalid` — which ARIA 1.2 made global attributes, so they are valid
 * anywhere — it is a violation on a container role such as `list` or the
 * implicit `group` of a `<fieldset>`, and on an element with no role at all.
 * axe reports that as `aria-allowed-attr` (critical), whatever the value: even
 * `aria-readonly="false"` fails.
 *
 * `useField` injects one prop bag for every field, `aria-readonly` included,
 * because most fields spread it straight onto their widget element. A field
 * whose outermost element is a container has to drop it before spreading, and
 * carry the read-only state on the widget it wraps instead — the checkboxes of
 * a checkbox group, the slider of a scale. A field with no widget to carry it
 * (`ArrayField`, whose list is not a control) simply does not expose it: the
 * state is already visible in the disabled affordances the field renders.
 */
export function omitAriaReadOnly<T extends { 'aria-readonly'?: boolean }>(
  props: T,
): Omit<T, 'aria-readonly'> {
  const { 'aria-readonly': _ariaReadOnly, ...rest } = props;
  return rest;
}
