import { isEqual, set } from 'es-toolkit/compat';
import { useState, type ComponentType, type ReactNode } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import { getValidations } from '~/utils/validations';

import type { ArchitectValidation } from '../toZodValidation';

/**
 * Wraps an array editor's value under its own field name, so cross-row
 * validators can resolve the `arrayName[i].attribute` path a row field's name
 * carries (`uniqueArrayAttribute` reads `get(allValues, 'options')`). Handles
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
  /** Architect rules, run here rather than by the form store. */
  validation?: ArchitectValidation;
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

/**
 * A row field inside an opaque array value.
 *
 * Rows of an array editor are NOT registered in the form store — the whole
 * array is one field — so their rules cannot run through `ArchitectField`'s
 * fresco-ui adapter. This runs the same `~/utils/validations` rules locally
 * and renders through `UnconnectedField`, which emits the identical
 * `data-field-name` seam E2E specs target. Errors appear once the row has been
 * edited, matching fresco-ui's never-before-interaction rule.
 *
 * These errors are therefore DISPLAY ONLY: nothing here reaches the owning
 * form's validity, and registering rows to change that is exactly what the
 * one-opaque-value rule forbids (a deleted row's dormant value would
 * resurrect itself). Any rule that must also BLOCK a save has to exist as an
 * array-level rule on the owning field as well — `Options.tsx`'s
 * `optionsValidation` is the worked example, pairing this row's
 * `uniqueArrayAttribute` with an equivalent whole-array check.
 *
 * Follows the `Query/Rules/RuleField.tsx` precedent.
 */
const RowField = ({
  component,
  name,
  label,
  value,
  onChange,
  validation,
  allValues,
  forceShowErrors = false,
  ...fieldProps
}: RowFieldProps) => {
  const [edited, setEdited] = useState(false);

  const errors = getValidations(validation ?? {}).reduce<string[]>(
    (memo, rule) => {
      const message = rule(value, allValues, undefined, name);
      if (message) memo.push(message);
      return memo;
    },
    [],
  );

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
};

export default RowField;
