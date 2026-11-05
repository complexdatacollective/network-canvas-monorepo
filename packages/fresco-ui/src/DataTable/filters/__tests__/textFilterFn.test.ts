import {
  type Row,
  type RowData,
  type TableFeatures,
} from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';

import { textFilterFn } from '../filterFns';

const rowWith = (cell: unknown) =>
  ({ getValue: () => cell }) as unknown as Row<TableFeatures, RowData>;

const matches = (cell: unknown, query: string) =>
  textFilterFn(rowWith(cell), 'column', query);

describe('textFilterFn', () => {
  it('matches primitives and dates by their text', () => {
    expect(matches('Alice Smith', 'smith')).toBe(true);
    expect(matches(42, '42')).toBe(true);
    expect(matches(10n, '10')).toBe(true);
    expect(matches(Symbol('tag'), 'tag')).toBe(true);
  });

  it('matches an object cell against its JSON text', () => {
    expect(matches({ x: 0.25, y: 0.5 }, '"x":0.25')).toBe(true);
    expect(matches(['red', 'blue'], 'blue')).toBe(true);
    expect(matches({ x: 1 }, 'object')).toBe(false);
  });

  it('treats a cell JSON cannot represent as having no text', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(matches(circular, 'self')).toBe(false);
    expect(matches({ count: 1n }, 'count')).toBe(false);
    expect(matches(() => 'value', 'value')).toBe(false);
  });

  it('keeps every row for an empty query', () => {
    expect(matches(null, '  ')).toBe(true);
  });
});
