import { normalizeCodebookName } from '@codaco/shared-consts';

/**
 * Option text as schema 9 names an option value: control characters become
 * spaces, then the text is trimmed and put in canonical form. The schema 9
 * migration renames option values this way, but leaves roster files as they
 * were, so a roster still spelling `"Yes "` finds the option now named
 * `"Yes"`.
 */
export const asOptionName = (text: string) =>
  normalizeCodebookName(text.toWellFormed().replace(/[\p{Cc}￾￿]/gu, ' '));
