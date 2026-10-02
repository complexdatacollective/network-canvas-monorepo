import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  CodebookIdSchema,
  CodebookNameSchema,
  normalizeCodebookName,
} from '../variables.ts';

// Built from code points so that no invisible or ill-formed character has to
// be written into this file literally.
const char = (codePoint: number) => String.fromCodePoint(codePoint);
const loneSurrogate = String.fromCharCode(0xd800);
const PRECOMPOSED_E = char(0xe9);
const DECOMPOSED_E = `e${char(0x301)}`;

const accepts = (value: string) => CodebookNameSchema.safeParse(value).success;

// XML 1.0 (fifth edition) production [2]:
// Char ::= #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
const isXmlChar = (codePoint: number) =>
  codePoint === 0x9 ||
  codePoint === 0xa ||
  codePoint === 0xd ||
  (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
  (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
  (codePoint >= 0x10000 && codePoint <= 0x10ffff);

describe('CodebookIdSchema', () => {
  it.each(['person', 'a1b2-c3d4', 'ns:id', 'v_1.2'])('accepts %j', (id) => {
    expect(CodebookIdSchema.safeParse(id).success).toBe(true);
  });

  it.each(['', 'close friend', '友人', 'a#b'])('refuses %j', (id) => {
    expect(CodebookIdSchema.safeParse(id).success).toBe(false);
  });

  it('refuses __proto__, saying why', () => {
    const result = CodebookIdSchema.safeParse('__proto__');

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('An id cannot be __proto__');
  });

  // Other Object.prototype names are ordinary own keys to every copy a
  // codebook goes through, so nothing about them is lost.
  it.each(['constructor', 'prototype', 'toString', 'hasOwnProperty'])(
    'accepts %j, which a record keyed by it keeps through parsing and copying',
    (id) => {
      expect(CodebookIdSchema.safeParse(id).success).toBe(true);

      const parsed = z
        .record(CodebookIdSchema, z.object({ name: z.string() }))
        .parse(JSON.parse(`{"${id}": {"name": "kept"}}`));

      for (const copy of [
        parsed,
        { ...parsed },
        Object.assign({}, parsed),
        structuredClone(parsed),
      ]) {
        expect(Object.hasOwn(copy, id)).toBe(true);
        expect(Object.getOwnPropertyDescriptor(copy, id)?.value).toEqual({
          name: 'kept',
        });
      }
    },
  );
});

describe('CodebookNameSchema', () => {
  it.each([
    'Freund',
    'amigo cercano',
    '友人',
    `Coll${char(0xe8)}gue`,
    'close-friend',
    'What is your age?',
    `friend ${char(0x1f600)}`,
  ])('accepts %j', (name) => {
    expect(accepts(name)).toBe(true);
  });

  it.each([
    ['an empty name', ''],
    ['a name padded on both sides', ' Freund '],
    ['a name with a leading space', ' Freund'],
    ['a name with a trailing ideographic space', `友人${char(0x3000)}`],
    ['a decomposed é (NFD)', `caf${DECOMPOSED_E}`],
    ['U+0001', `a${char(0x1)}b`],
    ['a vertical tab inside the name', `a${char(0xb)}b`],
    ['a tab inside the name', `a${char(0x9)}b`],
    ['a line feed inside the name', `a${char(0xa)}b`],
    ['a carriage return inside the name', `a${char(0xd)}b`],
    ['U+007F (DEL)', `a${char(0x7f)}b`],
    ['U+0085 (NEL)', `a${char(0x85)}b`],
    ['U+FFFE', `a${char(0xfffe)}b`],
    ['U+FFFF', `a${char(0xffff)}b`],
    ['a lone surrogate', `a${loneSurrogate}b`],
  ])('refuses %s', (_description, name) => {
    expect(accepts(name)).toBe(false);
  });

  it('accepts the precomposed spelling it refuses decomposed', () => {
    expect(accepts(`caf${PRECOMPOSED_E}`)).toBe(true);
  });

  /**
   * The guarantee the rule exists for: every name it accepts can be written
   * into an XML 1.0 document, and so into a GraphML `attr.name`, unchanged.
   * Asked of every BMP code unit (lone surrogates included) between two
   * letters, and of the supplementary planes' edges, so a character the rule
   * forgot to refuse is found here rather than in a researcher's export.
   * Tab, line feed and carriage return are legal XML characters, but an XML
   * parser rewrites them to spaces in an attribute value, so the rule refuses
   * them too.
   */
  it('accepts only names that XML 1.0 can carry unchanged', () => {
    const acceptedNonXml: string[] = [];
    for (let codeUnit = 0; codeUnit <= 0xffff; codeUnit += 1) {
      if (
        accepts(`x${String.fromCharCode(codeUnit)}x`) &&
        !isXmlChar(codeUnit)
      ) {
        acceptedNonXml.push(codeUnit.toString(16));
      }
    }
    expect(acceptedNonXml).toEqual([]);

    for (const codePoint of [0x10000, 0x1f600, 0x1fffe, 0x10ffff]) {
      expect(isXmlChar(codePoint)).toBe(true);
      expect(accepts(`x${char(codePoint)}x`)).toBe(true);
    }

    for (const whitespace of [0x9, 0xa, 0xd]) {
      expect(accepts(`x${char(whitespace)}x`)).toBe(false);
    }
  });
});

describe('normalizeCodebookName', () => {
  it('composes and trims a name into the form the schema accepts', () => {
    const typed = `  caf${DECOMPOSED_E}${char(0x3000)}`;

    expect(accepts(typed)).toBe(false);
    expect(normalizeCodebookName(typed)).toBe(`caf${PRECOMPOSED_E}`);
    expect(accepts(normalizeCodebookName(typed))).toBe(true);
  });

  it('is idempotent', () => {
    const once = normalizeCodebookName(` Coll${DECOMPOSED_E}gue `);

    expect(normalizeCodebookName(once)).toBe(once);
  });

  it('keeps inner spaces', () => {
    expect(normalizeCodebookName(' amigo cercano ')).toBe('amigo cercano');
  });

  // Normalizing is not sanitizing: a control character the researcher pasted
  // is left in place for the schema to refuse, rather than silently removed.
  it('leaves characters the schema refuses inside the name', () => {
    const pasted = `a${char(0x1)}b`;

    expect(normalizeCodebookName(pasted)).toBe(pasted);
    expect(accepts(normalizeCodebookName(pasted))).toBe(false);
  });

  it('reduces a name of nothing but whitespace to the empty name', () => {
    expect(normalizeCodebookName(`  ${char(0x3000)} `)).toBe('');
  });
});
