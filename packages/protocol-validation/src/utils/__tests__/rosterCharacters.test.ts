import { describe, expect, it } from 'vitest';

import { findRosterCharacterProblems } from '../rosterCharacters.ts';

const jsonRoster = (attributes: Record<string, unknown>[]) =>
  JSON.stringify({ nodes: attributes.map((a) => ({ attributes: a })) });

describe('findRosterCharacterProblems', () => {
  describe('which characters are refused', () => {
    it.each([
      ['NUL', '\u0000', 'U+0000'],
      ['BEL', '\u0007', 'U+0007'],
      ['backspace', '\u0008', 'U+0008'],
      ['unit separator', '\u001F', 'U+001F'],
      ['U+FFFE', '\uFFFE', 'U+FFFE'],
      ['U+FFFF', '\uFFFF', 'U+FFFF'],
    ])('refuses %s in a cell', async (_label, character, label) => {
      const report = await findRosterCharacterProblems(
        `name,notes\nAlice,a${character}b\n`,
        'csv',
      );

      expect(report).toEqual({
        problems: [{ kind: 'cell', row: 2, column: 'notes', character: label }],
        total: 1,
      });
    });

    // JSON is the only way a file's bytes can carry one: UTF-8 has no
    // encoding for a lone surrogate, but a JSON escape can name one.
    it.each([
      ['an unpaired high surrogate', '\uD800', 'U+D800'],
      ['an unpaired low surrogate', '\uDC00', 'U+DC00'],
    ])('refuses %s in a value', async (_label, character, label) => {
      const report = await findRosterCharacterProblems(
        jsonRoster([{ notes: `a${character}b` }]),
        'json',
      );

      expect(report).toEqual({
        problems: [
          {
            kind: 'attributeValue',
            node: 1,
            attribute: 'notes',
            character: label,
          },
        ],
        total: 1,
      });
    });

    it('refuses an unpaired surrogate in CSV text, which the parser would replace', async () => {
      const report = await findRosterCharacterProblems(
        'name,notes\nAlice,a\uD800b\n',
        'csv',
      );

      expect(report.problems).toEqual([
        { kind: 'line', line: 2, character: 'U+D800' },
      ]);
    });

    it.each([
      ['tab', 'a\tb'],
      ['a line feed in a quoted cell', '"a\nb"'],
      ['a carriage return in a quoted cell', '"a\rb"'],
      ['CRLF in a quoted cell', '"a\r\nb"'],
      ['DEL', 'a\u007Fb'],
      ['a C1 control', 'a\u0085b'],
      ['a surrogate pair', 'a\u{1F600}b'],
      ['another noncharacter', 'a\uFDD0b'],
      ['text in another script', '王小明'],
    ])('allows %s', async (_label, cell) => {
      const report = await findRosterCharacterProblems(
        `name,notes\r\nAlice,${cell}\r\n`,
        'csv',
      );

      expect(report).toEqual({ problems: [], total: 0 });
    });
  });

  describe('CSV', () => {
    it('names the column whose header holds the character', async () => {
      const report = await findRosterCharacterProblems(
        'name,no\u0007tes\nAlice,x\n',
        'csv',
      );

      expect(report.problems).toEqual([
        { kind: 'columnName', column: 2, character: 'U+0007' },
      ]);
    });

    it('names the spreadsheet row and the column of a cell, past blank lines and multi-line cells', async () => {
      const report = await findRosterCharacterProblems(
        'name,notes\nAlice,"one\ntwo"\n\nBob,ok\nCara,b\u0001ad\n',
        'csv',
      );

      expect(report.problems).toEqual([
        { kind: 'cell', row: 5, column: 'notes', character: 'U+0001' },
      ]);
    });

    it('reports every cell, in file order', async () => {
      const report = await findRosterCharacterProblems(
        'name,notes\nA\u0002,x\nB,y\u0003\n',
        'csv',
      );

      expect(report.problems).toEqual([
        { kind: 'cell', row: 2, column: 'name', character: 'U+0002' },
        { kind: 'cell', row: 3, column: 'notes', character: 'U+0003' },
      ]);
    });

    it('falls back to the line for a character the parser trims from the edge of a cell', async () => {
      const report = await findRosterCharacterProblems(
        'name,notes\nAlice,\u000Bx\n',
        'csv',
      );

      expect(report.problems).toEqual([
        { kind: 'line', line: 2, character: 'U+000B' },
      ]);
    });
  });

  describe('JSON', () => {
    it('names the node and attribute of a value', async () => {
      const report = await findRosterCharacterProblems(
        jsonRoster([{ name: 'Alice' }, { name: 'Bob', notes: 'b\u0007d' }]),
        'json',
      );

      expect(report.problems).toEqual([
        {
          kind: 'attributeValue',
          node: 2,
          attribute: 'notes',
          character: 'U+0007',
        },
      ]);
    });

    it('finds a character inside a list value', async () => {
      const report = await findRosterCharacterProblems(
        jsonRoster([{ tags: ['ok', 'b\uFFFEd'] }]),
        'json',
      );

      expect(report.problems).toEqual([
        {
          kind: 'attributeValue',
          node: 1,
          attribute: 'tags',
          character: 'U+FFFE',
        },
      ]);
    });

    it('names the node whose attribute name holds the character', async () => {
      const report = await findRosterCharacterProblems(
        jsonRoster([{ 'no\u001Ftes': 'x' }]),
        'json',
      );

      expect(report.problems).toEqual([
        { kind: 'attributeName', node: 1, character: 'U+001F' },
      ]);
    });

    it('finds a character written as an escape, which the raw text does not show', async () => {
      const report = await findRosterCharacterProblems(
        '{"nodes":[{"attributes":{"name":"a\\u0007b"}}]}',
        'json',
      );

      expect(report.problems).toEqual([
        {
          kind: 'attributeValue',
          node: 1,
          attribute: 'name',
          character: 'U+0007',
        },
      ]);
    });

    it('falls back to the line for a file the character stops parsing', async () => {
      const report = await findRosterCharacterProblems(
        '{"nodes": [\n{"attributes": {"name": "a\u0007b"}}\n]}',
        'json',
      );

      expect(report.problems).toEqual([
        { kind: 'line', line: 2, character: 'U+0007' },
      ]);
    });
  });

  it('returns at most 100 problems and counts them all', async () => {
    const rows = Array.from({ length: 150 }, (_, i) => `n${i},x\u0007`);
    const report = await findRosterCharacterProblems(
      ['name,notes', ...rows].join('\n'),
      'csv',
    );

    expect(report.problems).toHaveLength(100);
    expect(report.total).toBe(150);
    expect(report.problems[0]).toEqual({
      kind: 'cell',
      row: 2,
      column: 'notes',
      character: 'U+0007',
    });
  });
});
