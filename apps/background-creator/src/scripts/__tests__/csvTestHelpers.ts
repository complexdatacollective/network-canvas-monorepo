import type { FixturePoint } from '../fixtures';

// Minimal RFC 4180-ish CSV reader: enough to parse the output of Python's
// csv.DictWriter and R's write.csv, including quoted fields and doubled quotes
// (so hostile zone labels containing quotes round-trip correctly).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === undefined) continue;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function toRecords(table: string[][]): {
  header: string[];
  records: Record<string, string>[];
} {
  const [header, ...rows] = table;
  if (!header) {
    throw new Error('CSV had no header row');
  }
  const records = rows.map((row) => {
    const record: Record<string, string> = {};
    header.forEach((name, index) => {
      record[name] = row[index] ?? '';
    });
    return record;
  });
  return { header, records };
}

export function buildFixtureCsv(
  layout: string,
  points: FixturePoint[],
): string {
  const header = ['id', 'name', `${layout}_x`, `${layout}_y`].join(',');
  const lines = points.map((entry, index) =>
    [
      `n${index}`,
      `Node ${index}`,
      String(entry.point.x),
      String(entry.point.y),
    ].join(','),
  );
  return `${[header, ...lines].join('\n')}\n`;
}
