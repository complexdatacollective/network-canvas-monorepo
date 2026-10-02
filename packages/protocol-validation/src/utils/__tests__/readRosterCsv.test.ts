import { describe, expect, it } from 'vitest';

import { readRosterCsv } from '../readRosterCsv.ts';

describe('readRosterCsv', () => {
  it('pairs each row with the header', async () => {
    const { columns, rows } = await readRosterCsv('name,age\nAlice,30\n');

    expect(columns).toEqual(['name', 'age']);
    expect(rows).toEqual([{ row: 2, values: { name: 'Alice', age: '30' } }]);
  });

  it('numbers rows as a spreadsheet does, counting blank lines and treating a quoted line break as part of its cell', async () => {
    const { rows } = await readRosterCsv(
      'name,notes\n\nAlice,"line one\nline two"\n\nBob,x\n',
    );

    expect(rows).toEqual([
      { row: 3, values: { name: 'Alice', notes: 'line one\nline two' } },
      { row: 5, values: { name: 'Bob', notes: 'x' } },
    ]);
  });

  it('keeps a column name exactly as written, including __proto__ and dotted names', async () => {
    const { columns, rows } = await readRosterCsv(
      '__proto__,home.city\nAlice,Leeds\n',
    );

    expect(columns).toEqual(['__proto__', 'home.city']);
    const [first] = rows;
    expect(Object.keys(first?.values ?? {})).toEqual([
      '__proto__',
      'home.city',
    ]);
    expect(Object.getPrototypeOf(first?.values)).toBe(Object.prototype);
  });

  it('names a column with a blank header after its position', async () => {
    const { columns, rows } = await readRosterCsv('name,\nAlice,30\n');

    expect(columns).toEqual(['name', 'field2']);
    expect(rows[0]?.values).toEqual({ name: 'Alice', field2: '30' });
  });
});
