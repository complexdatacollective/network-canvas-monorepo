import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import isUnanswered from '@codaco/fresco-ui/form/validation/utils/isUnanswered';
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

type FormValuesToAttributePatchOptions = {
  /**
   * Fields whose stored answer the form could not show. Left unanswered, such
   * a field keeps that answer rather than clearing it: only a new answer
   * replaces it.
   */
  keepWhenUnanswered?: readonly string[];
};

export function formValuesToAttributePatch(
  values: Readonly<Record<string, FieldValue>>,
  mountedFieldNames: readonly string[],
  { keepWhenUnanswered = [] }: FormValuesToAttributePatchOptions = {},
): FormValuesToAttributePatchResult {
  const set: Record<string, VariableValue> = {};
  const unset: string[] = [];
  const invalidFieldNames: string[] = [];

  for (const fieldName of mountedFieldNames) {
    const value = Object.hasOwn(values, fieldName)
      ? values[fieldName]
      : undefined;

    if (keepWhenUnanswered.includes(fieldName) && isUnanswered(value)) {
      continue;
    }

    if (value === undefined) {
      unset.push(fieldName);
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
