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
 * variable names, or two node types — collide would then depend on whose
 * laptop the protocol was written on, which is the same class of defect as
 * the canonical-equivalence hole this exists to close.
 */
export const normalizeForComparison = (value: string): string =>
  toCanonicalText(value).toLowerCase();
