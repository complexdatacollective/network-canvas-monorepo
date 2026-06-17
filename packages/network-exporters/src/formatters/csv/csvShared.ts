export const csvEOL = '\r\n';

const DIFFICULT_CHARACTERS = ['"', ',', '\r', '\n'];

const containsDifficultCharacters = (value: string) =>
  DIFFICULT_CHARACTERS.some((c) => value.includes(c));

const quoteValue = (value: string) => `"${value.replace(/"/g, '""')}"`;

// Characters that trigger formula evaluation in spreadsheet applications when
// they appear at the start of a cell. Prefixing the value with a single quote
// forces the cell to be treated as literal text, neutralizing CSV/formula
// injection (OWASP) from untrusted, participant-entered interview data.
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

const neutralizeFormula = (value: string) =>
  value.length > 0 && FORMULA_TRIGGERS.includes(value[0]!)
    ? `'${value}`
    : value;

export function sanitizeCellValue(
  value: unknown,
): string | number | boolean | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object') {
    let serialized: string;
    try {
      serialized = JSON.stringify(value) ?? '';
    } catch {
      serialized = '';
    }
    return quoteValue(serialized);
  }
  if (typeof value === 'string') {
    const neutralized = neutralizeFormula(value);
    return containsDifficultCharacters(neutralized)
      ? quoteValue(neutralized)
      : neutralized;
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
