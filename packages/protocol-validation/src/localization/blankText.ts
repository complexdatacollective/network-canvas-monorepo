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
 * read as the literal text it makes, so a message that quotes a space
 * (`' '`) is as blank as the space it stands for.
 */
export const isBlankMessage = (message: string): boolean =>
  isBlankText(messageText(message));
