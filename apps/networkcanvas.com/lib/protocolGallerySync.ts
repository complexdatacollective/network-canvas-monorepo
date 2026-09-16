import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { formatCsvTable, parseCsvTable } from './csvTable.ts';
import {
  derivedColumns,
  discoverWaves,
  edgeStagesColumn,
  isDerivedColumn,
  protocolAssetColumn,
  schemaVersionColumn,
  serializeEdgeStages,
  serializeStages,
  stageCountColumn,
  stagesColumn,
  WAVES_COLUMN,
} from './protocolGalleryColumns.ts';
import {
  type ProtocolArchiveSummary,
  readProtocolArchive,
} from './protocolStages.ts';
import { summarizeStages } from './stageTypes.ts';

async function readWaveArchive(
  filename: string,
  assetDirectory: string,
  context: string,
): Promise<ProtocolArchiveSummary> {
  try {
    return await readProtocolArchive(join(assetDirectory, filename));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unreadable';
    throw new Error(`${context}: ${message}`, { cause: error });
  }
}

function deriveWaveCells(
  wave: number,
  summary: ProtocolArchiveSummary | undefined,
): Record<string, string> {
  if (!summary) {
    return {
      [schemaVersionColumn(wave)]: '',
      [stageCountColumn(wave)]: '',
      [edgeStagesColumn(wave)]: '',
      [stagesColumn(wave)]: '',
    };
  }

  return {
    [schemaVersionColumn(wave)]: String(summary.schemaVersion),
    [stageCountColumn(wave)]: String(summary.stages.length),
    [edgeStagesColumn(wave)]: serializeEdgeStages(
      summarizeStages(summary.stages),
    ),
    [stagesColumn(wave)]: serializeStages(summary.stages),
  };
}

export async function syncProtocolGallery(
  contentFile: string,
  assetDirectory: string,
): Promise<string> {
  const [header, ...rows] = await parseCsvTable(
    await readFile(contentFile, 'utf8'),
  );
  if (!header) throw new Error('protocol-gallery.csv: missing header row');

  const authoredIndexes = header
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => !isDerivedColumn(column))
    .map(({ index }) => index);
  const waves = discoverWaves(header);
  const derived = derivedColumns(waves);
  const output: string[][] = [
    [...authoredIndexes.map((index) => header[index] ?? ''), ...derived],
  ];

  for (const [rowIndex, row] of rows.entries()) {
    const cell = (column: string): string =>
      row[header.indexOf(column)]?.trim() ?? '';

    const summaries = await Promise.all(
      waves.map(async (wave) => {
        const column = protocolAssetColumn(wave);
        const filename = cell(column);
        if (!filename) return undefined;
        return readWaveArchive(
          filename,
          assetDirectory,
          `protocol-gallery.csv: row ${rowIndex + 2}: ${column}`,
        );
      }),
    );

    const values: Record<string, string> = {
      [WAVES_COLUMN]: String(summaries.filter(Boolean).length),
    };
    waves.forEach((wave, index) => {
      Object.assign(values, deriveWaveCells(wave, summaries[index]));
    });

    output.push([
      ...authoredIndexes.map((index) => row[index] ?? ''),
      ...derived.map((column) => values[column] ?? ''),
    ]);
  }

  return formatCsvTable(output);
}
