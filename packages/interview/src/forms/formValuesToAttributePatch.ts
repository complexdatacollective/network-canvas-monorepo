import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import { type VariableValue, VariableValueSchema } from '@codaco/shared-consts';

import type { AttributePatch } from '../store/entityAttributePatch';

export type FormValuesToAttributePatchResult =
  | { success: true; patch: AttributePatch }
  | {
      success: false;
      error: {
        code: 'invalid-variable-value';
        fieldNames: readonly string[];
      };
    };

/**
 * The patch that saves a form's values. `shownValues` are the values the form
 * started from: a field left without a value is unset only when the form
 * showed it one, which the participant then cleared. A stored value the form
 * never showed, such as an answer it could not decrypt, is left as it is
 * unless the participant gives the field a new value.
 */
export function formValuesToAttributePatch(
  values: Readonly<Record<string, FieldValue>>,
  mountedFieldNames: readonly string[],
  shownValues: Readonly<Record<string, unknown>>,
): FormValuesToAttributePatchResult {
  const set: Record<string, VariableValue> = {};
  const unset: string[] = [];
  const invalidFieldNames: string[] = [];

  for (const fieldName of mountedFieldNames) {
    const value = Object.hasOwn(values, fieldName)
      ? values[fieldName]
      : undefined;

    if (value === undefined) {
      if (
        Object.hasOwn(shownValues, fieldName) &&
        shownValues[fieldName] !== undefined
      ) {
        unset.push(fieldName);
      }
      continue;
    }

    const result = VariableValueSchema.safeParse(value);
    if (!result.success) {
      invalidFieldNames.push(fieldName);
      continue;
    }

    Object.defineProperty(set, fieldName, {
      configurable: true,
      enumerable: true,
      value: result.data,
      writable: true,
    });
  }

  if (invalidFieldNames.length > 0) {
    return {
      success: false,
      error: {
        code: 'invalid-variable-value',
        fieldNames: invalidFieldNames,
      },
    };
  }

  return { success: true, patch: { set, unset } };
}
