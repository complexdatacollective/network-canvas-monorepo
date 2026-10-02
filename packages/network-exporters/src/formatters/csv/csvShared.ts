import { neutralizeCsvFormula } from '@codaco/shared-consts';

export const csvEOL = '\r\n';

const DIFFICULT_CHARACTERS = ['"', ',', '\r', '\n'];

const containsDifficultCharacters = (value: string) =>
  DIFFICULT_CHARACTERS.some((c) => value.includes(c));

const quoteValue = (value: string) => `"${value.replace(/"/g, '""')}"`;

const quoteIfNeeded = (value: string) =>
  containsDifficultCharacters(value) ? quoteValue(value) : value;

/**
 * A header cell. A variable's name can begin with a formula trigger, and a
 * protocol may come from someone else, so a header is guarded like an answer.
 */
export const csvHeaderCell = (header: string): string =>
  quoteIfNeeded(neutralizeCsvFormula(header));

export function sanitizeCellValue(
  value: unknown,
): string | number | boolean | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object') {
    // A JSON.stringify result always begins with `{`, `[`, or `"`, so it can
    // never start with a formula trigger; no formula neutralization needed here.
    let serialized: string;
    try {
      serialized = JSON.stringify(value) ?? '';
    } catch {
      serialized = '';
    }
    return quoteValue(serialized);
  }
  if (typeof value === 'string') {
    return quoteIfNeeded(neutralizeCsvFormula(value));
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return `${value as bigint}`;
}

const encoder = new TextEncoder();

export async function* toAsyncBytes(
  rows: Iterable<string>,
): AsyncIterable<Uint8Array> {
  for (const row of rows) {
    yield encoder.encode(row);
  }
}
