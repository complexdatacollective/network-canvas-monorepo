/**
 * What counts as a line break in text a participant reads: a line feed, a
 * carriage return, or Unicode's line or paragraph separator.
 *
 * It is defined once because one rule decides it in several places that must
 * never disagree: the schema that refuses a line break in text declared one
 * line, the migration that joins the lines of such text, and every editor of
 * it, which turns a typed or pasted break into a space. An editor that missed
 * a separator the schema refuses would save text the protocol then rejects.
 */
const LINE_BREAK = /[\n\r\u2028\u2029]/;

/** A run of line breaks, however the platform that wrote them spells one. */
const LINE_BREAK_RUN = /[\n\r\u2028\u2029]+/;

/** Every line break, one at a time. */
const EACH_LINE_BREAK = /[\n\r\u2028\u2029]/g;

/** Whether `text` holds a line break, which one-line text refuses. */
export const holdsLineBreak = (text: string): boolean => LINE_BREAK.test(text);

/**
 * The lines of `text`: the pieces between its runs of line breaks, so two
 * breaks together do not leave an empty piece between them.
 */
export const linesOf = (text: string): string[] => text.split(LINE_BREAK_RUN);

/**
 * Finished `text` as one line, as the migration joins a stored text: each run
 * of line breaks, with the whitespace around it, becomes one space, and the
 * ends are trimmed. Text with no line break is returned as it is. Never for
 * text still being typed, where trimming would join the word typed next to
 * the one before the break (see `lineBreaksAsSpaces`).
 *
 * Each line is trimmed rather than the whitespace matched around the breaks,
 * which would backtrack polynomially on a long run of spaces.
 */
export const asOneLine = (text: string): string =>
  holdsLineBreak(text)
    ? linesOf(text)
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .join(' ')
    : text;

/**
 * Text being typed into a one-line editor, with each line break it was given
 * (typed or pasted) replaced by a space and nothing else changed: the ends
 * are left alone, so the next word typed stays a word of its own, and the
 * text keeps its length, which a control's browser-applied `maxLength` has
 * already counted.
 */
export const lineBreaksAsSpaces = (text: string): string =>
  text.replace(EACH_LINE_BREAK, ' ');
