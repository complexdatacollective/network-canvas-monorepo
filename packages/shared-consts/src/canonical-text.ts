/**
 * Unicode canonical form for researcher-authored text.
 *
 * Two strings can be the same text and still differ byte for byte: `Café`
 * written with the precomposed U+00E9 and `Café` written as `e` + U+0301 are
 * canonically equivalent, render identically in every font, and are produced
 * interchangeably by different keyboards, input methods and paste sources.
 * Comparing them raw lets a pair of option labels through that reaches the
 * participant as two choices nothing distinguishes.
 *
 * NFC — not NFKC — is the form used here, and it is applied on the way IN as
 * well as at comparison time:
 *
 * - NFC is canonical composition, so it never changes what the text says. NFKC
 *   would additionally fold compatibility characters (`ﬁ` to `fi`, `①` to `1`,
 *   full-width forms to ASCII), rewriting researcher-authored text into
 *   something they did not type.
 * - NFC is what the W3C recommends for interchange and what browsers, input
 *   methods and `String.prototype.normalize()`'s default already produce, so
 *   storing it is a no-op for almost all input.
 * - Storing the composed form keeps GraphML and CSV export keys, and the
 *   markdown a participant is shown, byte-stable — so two protocols that look
 *   identical are identical.
 */
export const toCanonicalText = (value: string): string =>
  value.normalize('NFC');

/**
 * The canonical form, case-folded — the key under which two values are "the
 * same" for a uniqueness check. Case-insensitivity matches the comparison
 * Architect has always made; the normalization is what closes the canonical
 * equivalence hole.
 *
 * `toLowerCase`, deliberately, and never `toLocaleLowerCase`: the latter
 * folds by the AUTHORING MACHINE's locale, under which `I` lowercases to `ı`
 * rather than `i` (Turkish, Azeri). Whether two option labels — or two
 * variable names, or two node types, or two disease labels — collide would
 * then depend on whose laptop the protocol was written on, which is the same
 * class of defect as the canonical-equivalence hole this exists to close.
 *
 * It lives in shared-consts rather than in Architect because the same
 * uniqueness question is asked in three places that must never disagree: the
 * editor that refuses a duplicate as it is typed, the schema that decides
 * whether a stored protocol is valid, and the repair that renames a duplicate
 * it finds. A protocol carried between devices is validated on all of them.
 */
export const normalizeForComparison = (value: string): string =>
  toCanonicalText(value).toLowerCase();

/**
 * Whether a label nobody has written yet — absent, not text, or nothing but
 * whitespace. A participant cannot read any of them, so none of them is an
 * answer that clashes with another.
 */
const isUnwrittenLabel = (label: unknown): boolean =>
  typeof label !== 'string' || label.trim() === '';

/**
 * Whether two of these options would read the same way to a participant.
 *
 * Two choices nothing distinguishes is a question that cannot be answered, so
 * the same refusal is made in four places that must never disagree: the row
 * cell that says so where the researcher is typing, the form rule that refuses
 * the save, the codebook write that refuses it again on the way to the
 * protocol, and Architect's own option list. It lives here for the reason
 * `normalizeForComparison` above does — and it is asked THROUGH it, so case
 * and Unicode canonical equivalence are settled once: `Café` typed with a
 * precomposed `é` and `Café` typed as `e` plus a combining accent are the same
 * two words on screen, and so the same answer here.
 *
 * Takes the options rather than their labels so no caller can reach a
 * different reading of what an option's label IS, and judges a label after
 * trimming for the same reason: a label of nothing but spaces is a choice a
 * participant cannot read, not one they cannot tell from another. Which leaves
 * an unwritten label to the rules about an unfinished list.
 */
export const hasDuplicateOptionLabels = (options: unknown): boolean => {
  const seen = new Set<string>();

  return (Array.isArray(options) ? options : []).some((option) => {
    const label =
      typeof option === 'object' && option !== null
        ? Reflect.get(option, 'label')
        : undefined;
    if (isUnwrittenLabel(label)) return false;

    const comparable = normalizeForComparison(String(label));
    if (seen.has(comparable)) return true;
    seen.add(comparable);
    return false;
  });
};
