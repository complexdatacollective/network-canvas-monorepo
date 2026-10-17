/*
 * XML 1.0 admits only the characters of its `Char` production. A document
 * holding any other character is not well-formed, and a conforming parser
 * rejects the whole file rather than reading around it, so a single stray
 * control character in one answer makes an entire GraphML export unreadable.
 *
 * The excluded characters are the C0 controls other than tab, line feed and
 * carriage return, the surrogate code points (a surrogate is only legal as
 * half of a pair, which is one astral code point once the string is read by
 * code point), and U+FFFE and U+FFFF. DEL and the C1 controls are legal in
 * XML 1.0, as are the other Unicode noncharacters.
 */

const isXmlCharacter = (codePoint: number): boolean =>
  codePoint === 0x9 ||
  codePoint === 0xa ||
  codePoint === 0xd ||
  (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
  (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
  (codePoint >= 0x10000 && codePoint <= 0x10ffff);

// Iterating a string by code point yields a lone surrogate as a one-unit
// string, which is how an unpaired one is told from half of a valid pair.
const isIllegal = (character: string): boolean => {
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && !isXmlCharacter(codePoint);
};

/** Whether `value` holds a character XML 1.0 cannot represent. */
export const hasXmlIllegalCharacters = (value: string): boolean => {
  for (const character of value) {
    if (isIllegal(character)) return true;
  }
  return false;
};

/**
 * The characters in `value` that XML 1.0 cannot represent, each written as its
 * code point (`U+0007`), once each, in the order they first appear.
 */
export const xmlIllegalCodePoints = (value: string): string[] => {
  const codePoints = new Set<string>();
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && !isXmlCharacter(codePoint)) {
      codePoints.add(
        `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
      );
    }
  }
  return [...codePoints];
};

/**
 * `value` without the characters XML 1.0 cannot represent, and otherwise
 * unchanged: nothing is replaced, escaped or normalized, and the other
 * characters keep their order.
 */
export const stripXmlIllegalCharacters = (value: string): string => {
  if (!hasXmlIllegalCharacters(value)) return value;

  let stripped = '';
  for (const character of value) {
    if (!isIllegal(character)) stripped += character;
  }
  return stripped;
};
