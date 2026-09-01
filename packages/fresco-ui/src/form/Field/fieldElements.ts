/**
 * The elements a field renders around its control, the IDs they carry, and the
 * ARIA reference lists that point at them.
 *
 * This lives apart from `BaseField` so that a caller which spreads
 * `useField`'s `fieldProps` onto markup of its own can name the same IDs
 * without importing a React component — and so there is exactly one owner of
 * both the ID strings and the reference lists built from them.
 */

/**
 * The IDs of the elements BaseField renders around a control. BaseField names
 * its own elements from here, and so does everything that points at them, so
 * the strings exist in exactly one place.
 */
export function fieldElementIds(id: string) {
  return {
    label: `${id}-label`,
    required: `${id}-required`,
    hint: `${id}-hint`,
    error: `${id}-error`,
  };
}

/**
 * Which of BaseField's describing elements are actually present for a field.
 * Each flag is the condition BaseField renders that element from.
 */
export type FieldDescription = {
  /** The visually-hidden "Required" marker (`required`). */
  required?: boolean;
  /** The hint element (`hint ?? validationSummary`). */
  hint?: boolean;
  /** FieldErrors' live region. */
  error?: boolean;
};

/**
 * Which of the elements `fieldElementIds` names a caller actually renders.
 * The describing elements, plus the label the control is named by.
 */
export type FieldElements = FieldDescription & {
  /** The `FieldLabel` element the control takes its accessible name from. */
  label?: boolean;
};

/** Everything BaseField renders: the full set, for a control it wraps. */
export const BASE_FIELD_ELEMENTS: Required<FieldElements> = {
  label: true,
  required: true,
  hint: true,
  error: true,
};

/**
 * The `aria-describedby` list for a control, naming only the elements that are
 * actually rendered. A dangling IDREF is not merely ignored — the whole
 * `aria-describedby` list is a common point of failure for screen readers, and
 * every hintless or optional field used to ship one (#1385).
 *
 * This is the one owner of that list. Callers pass what they render; nothing
 * else assembles `${id}-…` references, so the conditions and the IDs cannot
 * drift away from the markup.
 */
export function fieldDescribedBy(
  id: string,
  description: FieldDescription,
): string {
  const ids = fieldElementIds(id);
  return [
    description.required && ids.required,
    description.hint && ids.hint,
    description.error && ids.error,
  ]
    .filter(Boolean)
    .join(' ');
}
