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

export function formValuesToAttributePatch(
  values: Readonly<Record<string, FieldValue>>,
  mountedFieldNames: readonly string[],
): FormValuesToAttributePatchResult {
  const set: Record<string, VariableValue> = {};
  const unset: string[] = [];
  const invalidFieldNames: string[] = [];

  for (const fieldName of mountedFieldNames) {
    const value = values[fieldName];

    if (value === undefined) {
      unset.push(fieldName);
      continue;
    }

    const result = VariableValueSchema.safeParse(value);
    if (!result.success) {
      invalidFieldNames.push(fieldName);
      continue;
    }

    set[fieldName] = result.data;
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
