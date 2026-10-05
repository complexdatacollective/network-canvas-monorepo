/**
 * Matches the one element whose whole text is `text`, where that text is
 * split across children.
 *
 * Several of this package's sentences emphasise a word inside themselves — the
 * form-field row's badge bolds the attribute's kind and its input control, the
 * locked-type warning bolds the kind — so the sentence lives in no single text
 * node and a plain string match finds nothing. Matching on `textContent`
 * instead finds the sentence, but also every ancestor that contains it, so an
 * element whose child already carries the whole text is excluded and the
 * innermost one is what a caller gets.
 */
export const exactlyText =
  (text: string) =>
  (_content: string, element: Element | null): boolean =>
    element !== null &&
    element.textContent === text &&
    ![...element.children].some((child) => child.textContent === text);

/**
 * What a markdown box holds, as the participant will read it.
 *
 * An option label, a prompt and every other piece of participant-facing text
 * in the builder is authored in a rich-text control, which is a contenteditable
 * document rather than an input — so it has no `value` at all, and
 * `toHaveValue` reports `undefined` against one however it was filled in. The
 * text is what a test asking what the researcher wrote actually means, and it
 * is the markdown's MEANING rather than its source: a label written
 * `**Very** close` reads `Very close`, with the emphasis carried by an element
 * a caller can ask about separately.
 */
export const richTextOf = (box: HTMLElement): string => box.textContent ?? '';
