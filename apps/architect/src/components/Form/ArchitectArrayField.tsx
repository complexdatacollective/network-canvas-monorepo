import type { ValidFieldComponent } from '@codaco/fresco-ui/form/Field/types';

import ArchitectField, { type ArchitectFieldProps } from './ArchitectField';

export type ArchitectArrayFieldProps<C extends ValidFieldComponent> =
  ArchitectFieldProps<C>;

/**
 * Array-valued counterpart to `ArchitectField`, for fresco-ui's `ArrayField`
 * and for Architect's own array editors.
 *
 * The whole array is ONE field value: rows are rendered by the component from
 * the `value` it receives and are never registered as individual fields in the
 * form store. Registering per-index leaves would let a deleted row's dormant
 * value resurrect itself in `getFormValues()`.
 *
 * Consequences for validation: array-level rules (`notEmpty`, `minTwoOptions`,
 * `completeOptions`, …) are ordinary entries in the same `validation` config
 * and reach fresco-ui through the shared adapter's `custom` entry, receiving
 * the entire array as their value. Row-level rules belong to the row's own
 * `UnconnectedField`s.
 *
 * The Issues-panel anchor uses the same `${name}._error` id as
 * `ArchitectField`, which is what the panel keys on.
 */
function ArchitectArrayField<C extends ValidFieldComponent>(
  props: ArchitectArrayFieldProps<C>,
) {
  return <ArchitectField<C> {...props} />;
}

export default ArchitectArrayField;
