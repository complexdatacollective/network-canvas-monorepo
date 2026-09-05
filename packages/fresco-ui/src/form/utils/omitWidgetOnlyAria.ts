/**
 * The ARIA attributes `useField` injects that only a widget role may carry.
 *
 * ARIA 1.2 made `aria-disabled` and `aria-invalid` global attributes, so they
 * are valid on any element and stay in the bag. `aria-readonly` and
 * `aria-required` were not: each is allowed only on the roles that list it as
 * supported — `aria-readonly` on `textbox`, `checkbox`, `combobox`, `grid`,
 * `gridcell`, `listbox`, `radiogroup`, `slider` and `spinbutton`;
 * `aria-required` on `combobox`, `gridcell`, `listbox`, `radiogroup`,
 * `spinbutton`, `textbox` and `tree`, plus the roles that inherit it such as
 * `checkbox`. On anything else — a container role such as `list` or the
 * implicit `group` of a `<fieldset>`, or an element with no role at all — axe
 * reports `aria-allowed-attr` (critical) whatever the value: even
 * `aria-readonly="false"` fails.
 */
type WidgetOnlyAriaKey = 'aria-readonly' | 'aria-required';

/**
 * `useField` injects one prop bag for every field, `aria-readonly` and
 * `aria-required` included, because most fields spread it straight onto their
 * widget element. A field whose outermost element is a container has to drop
 * both before spreading, and carry whichever of them that container's children
 * can legally hold — the individual checkboxes of a checkbox group, each row's
 * radio group in a matrix.
 *
 * Often nothing in the field can hold them: `ArrayField`'s list is not a
 * control at all, and a scale's only `slider` is an `<input type="range">`
 * Base UI nests inside its thumb and exposes no seam onto. Those fields simply
 * do not emit the attributes, and nothing is lost — required-ness still
 * reaches assistive technology through the visible marker on the field's label
 * and the visually hidden "Required" element that `BaseField` renders and
 * `aria-describedby` names, and the read-only state through the affordances
 * and handlers the field suppresses.
 */
export function omitWidgetOnlyAria<
  T extends Partial<Record<WidgetOnlyAriaKey, boolean>>,
>(props: T): Omit<T, WidgetOnlyAriaKey> {
  const {
    'aria-readonly': _ariaReadOnly,
    'aria-required': _ariaRequired,
    ...rest
  } = props;
  return rest;
}
