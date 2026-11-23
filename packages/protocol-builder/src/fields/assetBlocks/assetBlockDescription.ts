// A value the text shows inside a description is held, where text that shows
// values is drawn read-only, by a private-use character (see
// `DynamicMessageSummary`); a description is plain words.
const PRIVATE_USE = /[-\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu;

/**
 * The words a block's description says, as a place that names the file
 * shows them: the description it was drawn with, less the characters that
 * hold a value's place, and without the space around it.
 */
export const assetBlockDescription = (alt: string): string =>
  alt.replace(PRIVATE_USE, '').trim();
