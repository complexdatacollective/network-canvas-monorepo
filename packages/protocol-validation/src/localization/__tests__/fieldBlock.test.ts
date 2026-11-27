import { describe, expect, it } from 'vitest';

import { testId } from '../../__tests__/testIds.ts';
import {
  fieldBlockMarkdown,
  fieldBlockUrl,
  isFieldBlockUrl,
  readFieldBlockUrl,
  renameFieldBlocks,
} from '../fieldBlock.ts';

const FIELD_1 = testId('field-1');
const FIELD_2 = testId('field-2');
const FIELD_3 = testId('field-3');

describe('field block addresses', () => {
  it('writes a field as an image with no description whose address names it', () => {
    expect(fieldBlockMarkdown(FIELD_1)).toBe(`![](field:${FIELD_1})`);
    expect(fieldBlockUrl(FIELD_1)).toBe(`field:${FIELD_1}`);
  });

  it('reads the id of the field an address names', () => {
    expect(isFieldBlockUrl(`field:${FIELD_1}`)).toBe(true);
    expect(isFieldBlockUrl(`FIELD:${FIELD_1}`)).toBe(true);
    expect(readFieldBlockUrl(`field:${FIELD_1}`)).toBe(FIELD_1);
  });

  it('reads no field from another address', () => {
    expect(isFieldBlockUrl('asset:photo')).toBe(false);
    expect(readFieldBlockUrl('https://example.com/field:x')).toBeUndefined();
  });

  it('reads an address without an id, or with one that cannot be decoded, as naming no field', () => {
    expect(readFieldBlockUrl('field:')).toBe('');
    expect(readFieldBlockUrl('field:%E0%A4%A')).toBe('');
  });

  it.each([
    ['a parenthesis', 'a(b)'],
    ['an apostrophe', "it's"],
    ['a space', 'a b'],
    ['an exclamation mark', 'a!'],
  ])('writes an id with %s as one address it reads back', (_, fieldId) => {
    const url = fieldBlockUrl(fieldId);
    expect(url).not.toMatch(/[()'\s!]/);
    expect(readFieldBlockUrl(url)).toBe(fieldId);
  });
});

describe('renameFieldBlocks', () => {
  it('names the new id of each renamed field, and leaves the rest of the text as it is', () => {
    const message = `Intro '{'braces'}'.\n\n![](field:${FIELD_1})\n\n![](field:${FIELD_2})`;
    expect(renameFieldBlocks(message, new Map([[FIELD_1, FIELD_3]]))).toBe(
      `Intro '{'braces'}'.\n\n![](field:${FIELD_3})\n\n![](field:${FIELD_2})`,
    );
  });

  it('renames in one pass, so that two fields can swap ids', () => {
    expect(
      renameFieldBlocks(
        `![](field:${FIELD_1})\n\n![](field:${FIELD_2})`,
        new Map([
          [FIELD_1, FIELD_2],
          [FIELD_2, FIELD_1],
        ]),
      ),
    ).toBe(`![](field:${FIELD_2})\n\n![](field:${FIELD_1})`);
  });

  it('renames a field inside a version of a logic block', () => {
    expect(
      renameFieldBlocks(
        `{condition_x, select, true {![](field:${FIELD_1})} other {}}`,
        new Map([[FIELD_1, FIELD_2]]),
      ),
    ).toBe(`{condition_x, select, true {![](field:${FIELD_2})} other {}}`);
  });

  it('renames in time that grows with the length of the text, however many field blocks it starts and does not end', () => {
    const renames = new Map([[FIELD_1, FIELD_2]]);
    const timeOf = (repeats: number, runs: number): number =>
      Math.min(
        ...Array.from({ length: runs }, () => {
          const message = '(field:'.repeat(repeats);
          const start = performance.now();
          renameFieldBlocks(message, renames);
          return performance.now() - start;
        }),
      );
    // Warm up, so that the first timed run is not also the first run.
    timeOf(1_000, 1);
    const short = timeOf(10_000, 5);
    const long = timeOf(40_000, 5);
    // Four times the length: about 4 in linear time, about 16 in quadratic
    // time. The margin leaves room for a loaded machine.
    expect(long / short).toBeLessThan(9);
  });

  it('leaves text that names no renamed field as it is', () => {
    const message = `![](field:${FIELD_1}) and [a link](https://example.com)`;
    expect(renameFieldBlocks(message, new Map())).toBe(message);
    expect(renameFieldBlocks(message, new Map([[FIELD_2, FIELD_3]]))).toBe(
      message,
    );
  });
});
