import { createAppIntl, formatMessageError } from '@codaco/app-i18n/messages';

const english = createAppIntl({ locale: 'en' });

/** Resolve the real stored-error contract before asserting researcher guidance. */
export function messageText(error: string): string;
export function messageText(error: unknown): unknown;
export function messageText(error: unknown): unknown {
  return typeof error === 'string'
    ? (formatMessageError(error, english) ?? error)
    : error;
}

/** Only form-result error fields are translated; submitted research data stays raw. */
export function messageFields(errors: unknown): unknown {
  if (typeof errors !== 'object' || errors === null || Array.isArray(errors))
    return errors;
  return Object.fromEntries(
    Object.entries(errors).map(([field, error]) => [field, messageText(error)]),
  );
}

/** Decode only the error containers of a submission result, preserving its other values. */
export function messageSubmissionResult(result: unknown): unknown {
  if (typeof result !== 'object' || result === null || Array.isArray(result))
    return result;
  const resolved = { ...result };
  if ('formErrors' in resolved && Array.isArray(resolved.formErrors)) {
    resolved.formErrors = resolved.formErrors.map(messageText);
  }
  if (
    'fieldErrors' in resolved &&
    typeof resolved.fieldErrors === 'object' &&
    resolved.fieldErrors !== null
  ) {
    resolved.fieldErrors = Object.fromEntries(
      Object.entries(resolved.fieldErrors).map(([field, errors]) => [
        field,
        Array.isArray(errors) ? errors.map(messageText) : messageText(errors),
      ]),
    );
  }
  return resolved;
}
