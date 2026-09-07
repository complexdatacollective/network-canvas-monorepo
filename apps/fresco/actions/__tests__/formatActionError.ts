import { createAppIntl, formatMessageError } from '@codaco/app-i18n/messages';

const english = createAppIntl({ locale: 'en' });

// Keep action behavior assertions readable while exercising the real transport.
export function formatActionError(error: string | null | undefined) {
  return typeof error === 'string'
    ? (formatMessageError(error, english) ?? error)
    : error;
}
