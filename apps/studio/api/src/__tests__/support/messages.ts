import { createAppIntl, formatMessageError } from '@codaco/app-i18n/messages';

const english = createAppIntl({ locale: 'en' });

/**
 * A failure message as the editor shows it to an English reader, or
 * `undefined` for plain text. Plain text is what the host sent before its
 * refusals were encoded: English that no reader's language could change.
 */
export function asTheEditorShowsIt(message: string): string | undefined {
  return formatMessageError(message, english);
}
