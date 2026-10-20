import { messageText } from './messageSyntax.ts';

/**
 * Text a participant would read as nothing: whitespace of any kind, and the
 * invisible characters that take no space of their own (zero-width spaces and
 * joiners, soft hyphens, byte order marks). Plain `trim()` leaves the latter
 * in place.
 */
const BLANK_TEXT = /^[\p{White_Space}\p{Default_Ignorable_Code_Point}]*$/u;

/** True when `text` is empty or made only of characters that show nothing. */
export const isBlankText = (text: string): boolean => BLANK_TEXT.test(text);

/**
 * `isBlankText` for one translation as the protocol stores it. The message is
 * read as the literal text it makes, so escaping changes nothing: a message
 * escaped from spaces is blank, while `' '` is not, because an apostrophe
 * quotes only before an ICU syntax character and so shows as written.
 */
export const isBlankMessage = (message: string): boolean =>
  isBlankText(messageText(message));
