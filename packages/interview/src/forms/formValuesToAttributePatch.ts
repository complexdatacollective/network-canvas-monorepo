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
   * The variables of every field the form asks: in a form with text, every
   * field that the text in the participant's language places, shown or not.
   * Any other variable is left as it is stored, so a field that only another
   * language's text places keeps its answer.
   */
  fields: readonly string[];
  /**
   * The variables of the fields on screen when the form is submitted. A field
   * the form asks but does not show (logic hides it) is cleared, so that an
   * answer the participant took back by changing an earlier one is not kept.
   */
  shown: ReadonlySet<string>;
  /**
   * Fields whose stored answer the form could not show. Left unanswered while
   * shown, such a field keeps that answer rather than clearing it: only a new
   * answer replaces it.
   */
  keepWhenUnanswered?: readonly string[];
};

export function formValuesToAttributePatch(
  values: Readonly<Record<string, FieldValue>>,
  { fields, shown, keepWhenUnanswered = [] }: FormValuesToAttributePatchOptions,
): FormValuesToAttributePatchResult {
  const set: Record<string, VariableValue> = {};
  const unset: string[] = [];
  const invalidFieldNames: string[] = [];

  for (const fieldName of fields) {
    if (!shown.has(fieldName)) {
      unset.push(fieldName);
      continue;
    }

    const value = values[fieldName];

    if (keepWhenUnanswered.includes(fieldName) && isUnanswered(value)) {
      continue;
    }

    // A shown question without an answer is saved as no answer: text that
    // is empty or only spaces, an empty list or NaN is unset, not stored, so
    // an answer typed and then deleted is not kept as ''. It is the same test
    // as the required check, and rules read "exists" by it.
    if (isUnanswered(value)) {
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
