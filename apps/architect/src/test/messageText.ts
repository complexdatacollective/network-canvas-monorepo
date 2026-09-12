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
