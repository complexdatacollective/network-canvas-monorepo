import { describe, expect, it } from 'vitest';

import { formatCsvTable, parseCsvTable } from '~/lib/csvTable';

const table = [
  ['Name', 'Notes', 'Empty'],
  ['plain', 'has, a comma', ''],
  ['quoted "inner"', 'line one\nline two', ' padded '],
];

describe('formatCsvTable', () => {
  it('quotes every cell, doubles embedded quotes and ends with a newline', () => {
    expect(formatCsvTable(table)).toBe(
      '"Name","Notes","Empty"\n' +
        '"plain","has, a comma",""\n' +
        '"quoted ""inner""","line one\nline two"," padded "\n',
    );
  });
});

describe('parseCsvTable', () => {
  it('round-trips formatted output without trimming or coercing cells', async () => {
    expect(await parseCsvTable(formatCsvTable(table))).toEqual(table);
  });

  it('reads numeric-looking cells as strings', async () => {
    expect(await parseCsvTable('"a","b"\n"1","007"\n')).toEqual([
      ['a', 'b'],
      ['1', '007'],
    ]);
  });
});
