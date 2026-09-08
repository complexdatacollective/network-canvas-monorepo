import { isEqual, set } from 'es-toolkit/compat';
import { type ComponentType, type ReactNode, useState } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';

import { rowIssues, type RowValidator } from './rowValidators.ts';

/**
 * Wraps an array editor's value under its own field name, so cross-row
 * validators can resolve the `arrayName[i].attribute` path a row field's name
 * carries (`uniqueRowAttribute` reads `get(allValues, 'options')`). Handles
 * dotted array names (`sortOptions.sortOrder`) the way `get` reads them.
 */
export const arrayScopedValues = (
  arrayName: string,
  value: unknown,
): Record<string, unknown> =>
  set({}, arrayName, value) as Record<string, unknown>;

export type RowFieldProps = {
  /** The fresco-ui control to render. */
  component: ComponentType<Record<string, unknown>>;
  /** Resolved path of this cell, e.g. `options[0].label`. */
  name: string;
  label: string;
  labelHidden?: boolean;
  hint?: ReactNode;
  inline?: boolean;
  value?: unknown;
  onChange?: (value: unknown) => void;
  disabled?: boolean;
  readOnly?: boolean;
  /** Rules run here rather than by the form store. */
  validators?: readonly RowValidator[];
  /**
   * What cross-row validators see as their `allValues` argument — build it
   * with `arrayScopedValues`.
   */
  allValues?: Record<string, unknown>;
  /**
   * Reveal errors without waiting for an edit (Options' "Finish editing
   * option" refusing to collapse an incomplete row).
   */
  forceShowErrors?: boolean;
  /** Anything else is forwarded to the control (placeholder, options, …). */
  [key: string]: unknown;
};

const NO_VALIDATORS: readonly RowValidator[] = [];

/**
 * A row field inside an opaque array value.
 *
 * Rows of an array editor are NOT registered in the form store — the whole
 * array is one field — so their rules cannot run through the field wrapper's
 * validation adapter. This runs them locally and renders through
 * `UnconnectedField`, which emits the identical `data-field-name` seam E2E
 * specs target. Errors appear once the row has been edited, matching
 * fresco-ui's never-before-interaction rule.
 *
 * These errors are therefore DISPLAY ONLY: nothing here reaches the owning
 * form's validity, and registering rows to change that is exactly what the
 * one-opaque-value rule forbids (a deleted row's dormant value would
 * resurrect itself). Any rule that must also BLOCK a save has to exist as an
 * array-level rule on the owning field as well — `Options.tsx`'s
 * `optionsValidation` is the worked example, pairing this row's
 * `uniqueRowAttribute` with an equivalent whole-array check.
 */
export default function RowField({
  component,
  name,
  label,
  value,
  onChange,
  validators = NO_VALIDATORS,
  allValues,
  forceShowErrors = false,
  ...fieldProps
}: RowFieldProps) {
  const [edited, setEdited] = useState(false);

  const errors = rowIssues(validators, value, allValues, name);
  const showErrors = (edited || forceShowErrors) && errors.length > 0;

  const handleChange = (nextValue: unknown) => {
    // Some controls (the rich-text editor) emit a change when they mount.
    // Treating that as an edit would show "Required" on a row the researcher
    // has not touched yet.
    if (!isEqual(nextValue, value)) setEdited(true);
    onChange?.(nextValue);
  };

  return (
    <UnconnectedField
      {...fieldProps}
      component={component}
      name={name}
      label={label}
      value={value}
      onChange={handleChange}
      errors={errors}
      showErrors={showErrors}
      aria-invalid={showErrors}
    />
  );
}
