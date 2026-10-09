/*
 * How each export format writes text it cannot write as given. The exporters
 * write through these, and `findExportColumnConflicts` compares columns
 * through them, so the editors refuse two names that an export would write
 * the same way.
 */

// The characters XML 1.0 (5th edition) allows in a Name, production [4a]
// NameChar: https://www.w3.org/TR/xml/#NT-NameChar. GraphML types `attr.name`
// as an xs:NMTOKEN, which is any run of them, so every Unicode letter is valid
// and spaces and most punctuation are not.
const NAME_CHARACTERS = [
  ':A-Z_a-z\\-.0-9',
  '\\u00B7',
  '\\u00C0-\\u00D6',
  '\\u00D8-\\u00F6',
  '\\u00F8-\\u037D',
  '\\u037F-\\u1FFF',
  '\\u200C-\\u200D',
  '\\u203F-\\u2040',
  '\\u2070-\\u218F',
  '\\u2C00-\\u2FEF',
  '\\u3001-\\uD7FF',
  '\\uF900-\\uFDCF',
  '\\uFDF0-\\uFFFD',
  '\\u{10000}-\\u{EFFFF}',
].join('');

const NOT_A_NAME_CHARACTER = new RegExp(`[^${NAME_CHARACTERS}]`, 'gu');

/**
 * A valid NMTOKEN for `name`, to write as a GraphML `attr.name`: every
 * NameChar kept, every other character (a space, `(`, `/`, ...) replaced by
 * `_`. A name that is already a valid NMTOKEN is returned unchanged.
 */
export const toGraphMLAttrName = (name: string): string =>
  name.replace(NOT_A_NAME_CHARACTER, '_');

// Characters that trigger formula evaluation in spreadsheet applications when
// they appear at the start of a cell. Prefixing the value with a single quote
// forces the cell to be treated as literal text, neutralizing CSV/formula
// injection (OWASP) from untrusted, participant-entered interview data.
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * `value` as a CSV cell holds it before any quoting: with a `'` in front when
 * it begins with a character a spreadsheet would read as the start of a
 * formula, and otherwise unchanged.
 */
export const neutralizeCsvFormula = (value: string): string =>
  FORMULA_TRIGGERS.includes(value.charAt(0)) ? `'${value}` : value;
