import type {
  FieldValue,
  FormSubmissionResult,
  FormSubmitHandler,
} from '@codaco/fresco-ui/form/store/types';

/**
 * Context surfaced to a form-level `validate` function. Mirrors what
 * redux-form passed as `validate`'s second argument for an array item's
 * editor form (see InlineEditScreen/Form's eleventh-wave Finding 4 and
 * DialogArrayField's `editorValidate`): the committed array index of the row
 * being edited, so a sibling-duplicate check can exclude that row. A new
 * (not-yet-committed) item reports no index.
 */
export type FormLevelValidateContext = { editIndex?: number };

/**
 * A form-level validator run at the top of onSubmit, ahead of the caller's
 * own onSubmit — the redux-form `validate` option (InlineEditScreen/Form,
 * DialogArrayField's `editorValidate`) translated into a plain function. A
 * non-empty result short-circuits the submit with those field errors.
 */
export type FormLevelValidate = (
  values: Record<string, FieldValue>,
  context?: FormLevelValidateContext,
) => Record<string, string | string[]> | undefined;

/**
 * A submit handler that may resolve without an explicit result. Callers
 * ported from the redux-form era often signal success by simply not
 * throwing, rather than returning `{success: true}`.
 */
export type LenientSubmitHandler = (
  values: Record<string, FieldValue>,
) => FormSubmissionResult | void | Promise<FormSubmissionResult | void>;

// FormSubmissionResult's fieldErrors are string[] (compatible with Zod's
// flattenError shape); a form-level validate may report a single message per
// field as a bare string for convenience, so normalize it here.
const normalizeFieldErrors = (
  errors: Record<string, string | string[]>,
): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(errors).map(([field, message]) => [
      field,
      Array.isArray(message) ? message : [message],
    ]),
  );

/**
 * Wraps a caller's onSubmit with a form-level `validate` run first. A
 * non-empty validate result short-circuits to `{success: false, fieldErrors}`
 * without invoking onSubmit, so it flows through fresco-ui's normal invalid-
 * submit path (`onSubmitInvalid` / `focusFirstError`) exactly like a
 * field-level validation failure. Used by both DialogForm and AppForm.
 */
export function withFormLevelValidate(
  onSubmit: LenientSubmitHandler,
  validate?: FormLevelValidate,
  context?: FormLevelValidateContext,
): FormSubmitHandler {
  return async (values) => {
    if (validate) {
      const errors = validate(values, context);
      if (errors && Object.keys(errors).length > 0) {
        return { success: false, fieldErrors: normalizeFieldErrors(errors) };
      }
    }

    const result = await onSubmit(values);
    return result ?? { success: true };
  };
}
