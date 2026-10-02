import { expect } from 'vitest';

import type { BackgroundDocument } from '../../model/types';
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

// Names, values and zone labels outside Latin-1 (accents, CJK, an emoji), for
// the tests that run a generated script under a non-UTF-8 locale.
export const nonAsciiOpts = { layoutVariable: '位置', outputVariable: '区域' };

export const nonAsciiDocument: BackgroundDocument = {
  version: 1,
  title: 'Zones 区域',
  description: '',
  elements: [
    {
      id: 'outer',
      kind: 'rect',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fill: '#ffffff',
      fillOpacity: 0.25,
      stroke: null,
      strokeWidth: 1,
      zoneLabel: '外圈 Renée 😀',
    },
    {
      id: 'centre',
      kind: 'ellipse',
      cx: 0.5,
      cy: 0.5,
      rx: 0.2,
      ry: 0.2,
      fill: '#ffffff',
      fillOpacity: 0.25,
      stroke: null,
      strokeWidth: 1,
      zoneLabel: '中心',
    },
  ],
};

const nonAsciiHeader = ['id', 'name 名前', '位置_x', '位置_y'];
const nonAsciiRows = [
  ['n0', 'Renée 你好 😀', '0.5', '0.5'],
  ['n1', 'plain', '0.99', '0.99'],
  ['n2', '日本語 "quoted", comma', '0.05', '0.05'],
];
const nonAsciiZoneLabels = ['中心', '外圈 Renée 😀', '外圈 Renée 😀'];

function csvCell(value: string): string {
  return /[",]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function buildNonAsciiCsv(withBom: boolean): string {
  const body = [nonAsciiHeader, ...nonAsciiRows]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');
  return `${withBom ? '\uFEFF' : ''}${body}\n`;
}

// Checks the output file byte for byte: valid UTF-8 with no byte-order mark and
// no <U+XXXX> escapes, the original header and cells unchanged, and the right
// zone label on every row.
export function expectNonAsciiOutput(bytes: Buffer): void {
  expect(bytes.subarray(0, 3)).not.toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  expect(text).not.toContain('<U+');

  const { header, records } = toRecords(parseCsv(text));
  expect(header).toEqual([...nonAsciiHeader, nonAsciiOpts.outputVariable]);
  expect(records).toHaveLength(nonAsciiRows.length);
  records.forEach((record, index) => {
    nonAsciiHeader.forEach((column, columnIndex) => {
      expect(record[column], `${column} of row ${index}`).toBe(
        nonAsciiRows[index]?.[columnIndex],
      );
    });
    expect(record[nonAsciiOpts.outputVariable], `zone of row ${index}`).toBe(
      nonAsciiZoneLabels[index],
    );
  });
}
