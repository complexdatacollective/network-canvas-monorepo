import { createAppIntl, formatMessageError } from '@codaco/app-i18n/messages';

import type { LoginResult } from '../auth';

const english = createAppIntl({ locale: 'en' });

// Keep action behavior assertions readable while exercising the real transport.
export function formatActionError(error: string | null | undefined) {
  return typeof error === 'string'
    ? (formatMessageError(error, english) ?? error)
    : error;
}

// Throws rather than returning, so a result without form errors fails the test
// instead of skipping its message assertion.
export function formErrorMessages(result: LoginResult) {
  if (result.success || !('formErrors' in result)) {
    throw new Error(`Expected form errors, got ${JSON.stringify(result)}`);
  }
  return result.formErrors?.map(formatActionError);
}
