import csv from 'csvtojson';
import { z } from 'zod';

const tableSchema = z.array(z.array(z.string()));

export async function parseCsvTable(source: string): Promise<string[][]> {
  const rows: unknown = await csv({
    noheader: true,
    output: 'csv',
    trim: false,
    checkType: false,
  }).fromString(source);
  return tableSchema.parse(rows);
}

function quoteCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function formatCsvTable(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(quoteCell).join(',')).join('\n') + '\n';
}
