import { access, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import csv from 'csvtojson';
import { z } from 'zod';

import { isStageType } from '@codaco/fresco-ui/stages/stageTypes';
import type { StageType } from '@codaco/protocol-validation';
import {
  codebookAssetColumn,
  discoverWaves,
  edgeStagesColumn,
  protocolAssetColumn,
  schemaVersionColumn,
  serializeEdgeStages,
  stageCountColumn,
  stagesColumn,
  SYNC_COMMAND,
  WAVES_COLUMN,
} from '~/lib/protocolGalleryColumns';
import type { ProtocolStage } from '~/lib/protocolStages';
import { summarizeStages } from '~/lib/stageTypes';

export type { ProtocolStage } from '~/lib/protocolStages';

export type ProtocolDownload = {
  wave: number;
  protocolFilename: string;
  protocolPath: string;
  codebookFilename: string;
  codebookPath: string;
  stages: ProtocolStage[];
};

export type ProtocolSupplementaryMaterial = {
  filename: string;
  path: string;
  label: string;
};

export type GalleryProtocol = {
  [key: string]: unknown;
  slug: string;
  title: string;
  shortName: string;
  authors: string;
  studyPi: string;
  contact: string;
  citation: string;
  publicationUrl: string;
  grantNumber: string;
  clinicalTrialsRegistration: string;
  fields: string[];
  population: string;
  edgeGeneration: string[];
  usesRosters: boolean;
  summary: string;
  description: string;
  sandboxUrl: string | undefined;
  featured: boolean;
  dateAdded: string;
  searchText: string;
  downloads: ProtocolDownload[];
  supplementaryMaterials: ProtocolSupplementaryMaterial[];
};

const requiredText = z.string().trim().min(1);
const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a URL-safe slug');
const httpsUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => value.startsWith('https://'), 'must use HTTPS');
const filename = z
  .string()
  .trim()
  .min(1)
  .refine((value) => basename(value) === value, 'must be a filename')
  .refine(
    (value) => !value.includes('..'),
    'must not contain parent traversal',
  );
const protocolFilename = filename.refine(
  (value) => value.endsWith('.netcanvas'),
  'must use the .netcanvas extension',
);
const codebookFilename = filename.refine(
  (value) => value.endsWith('.pdf'),
  'must use the .pdf extension',
);
const optionalProtocolFilename = z.union([protocolFilename, z.literal('')]);
const optionalCodebookFilename = z.union([codebookFilename, z.literal('')]);
const optionalText = z.string().trim().optional().default('');
const optionalHttpsUrl = z.union([httpsUrl, z.literal('')]);
const yesNo = z.enum(['yes', 'no']);
const integer = z.string().trim().regex(/^\d+$/, 'must be a whole number');
const optionalInteger = z.union([integer, z.literal('')]);
const derivedText = z.string().trim();

const authoredRowShape = {
  'Slug': slug,
  'Protocol Authors': requiredText,
  'Study Title': requiredText,
  'Study PI': requiredText,
  'Protocol Contact': requiredText,
  'Protocol Title [StudyAcronym_DatePublishedtoPG]': requiredText,
  'Cite Publication': requiredText,
  'Cite Publication (HTML)': requiredText,
  'Publication URL': httpsUrl,
  'Grant Number': requiredText,
  'Clinical Trials Registration': requiredText,
  'Field(s)': requiredText,
  'Population': requiredText,
  'Edge Generation Methodology': requiredText,
  'Uses Rosters': yesNo,
  'Qualitative Summary': requiredText,
  'Descriptive Sentence': requiredText,
  'Protocol File (original)': requiredText,
  'Codebook Summary (original)': requiredText,
  'Protocol File (asset)': protocolFilename,
  'Codebook Summary (asset)': codebookFilename,
  'Fresco': optionalHttpsUrl,
  'Featured': yesNo,
  'Supplementary Material Label': optionalText,
  'Supplementary Material (asset)': optionalCodebookFilename
    .optional()
    .default(''),
  'Date Added': requiredText,
};

const authoredRowSchema = z.object(authoredRowShape);

type AuthoredRow = z.infer<typeof authoredRowSchema>;
type ProtocolRow = AuthoredRow & Record<string, string>;

function waveColumnSchema(waves: readonly number[]) {
  const shape: Record<string, z.ZodType<string>> = {
    [WAVES_COLUMN]: integer,
  };
  for (const wave of waves) {
    if (wave !== 1) {
      shape[protocolAssetColumn(wave)] = optionalProtocolFilename;
      shape[codebookAssetColumn(wave)] = optionalCodebookFilename;
    }
    shape[schemaVersionColumn(wave)] = optionalInteger;
    shape[stageCountColumn(wave)] = optionalInteger;
    shape[edgeStagesColumn(wave)] = derivedText;
    shape[stagesColumn(wave)] = derivedText;
  }
  return z.object(shape);
}

function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issueField(issue)}: ${issue.message}` : 'invalid row';
}

function parseRow(
  record: Record<string, string>,
  waveSchema: ReturnType<typeof waveColumnSchema>,
): ProtocolRow {
  const unknownColumn = Object.keys(record).find(
    (column) => !(column in authoredRowShape) && !(column in waveSchema.shape),
  );
  if (unknownColumn) throw new Error(`${unknownColumn}: unrecognized column`);

  const authored = authoredRowSchema.safeParse(record);
  if (!authored.success) throw new Error(firstIssueMessage(authored.error));
  const waveColumns = waveSchema.safeParse(record);
  if (!waveColumns.success) {
    throw new Error(firstIssueMessage(waveColumns.error));
  }

  return { ...waveColumns.data, ...authored.data };
}

const stagesCellSchema = z
  .array(
    z.object({
      type: z.custom<StageType>(
        (value) => typeof value === 'string' && isStageType(value),
        'unknown stage type',
      ),
      label: z.string().trim().min(1),
    }),
  )
  .min(1);

const csvRowsSchema = z.array(z.record(z.string(), z.string()));
const publicAssetRoot = '/protocols/protocol-gallery';

function issueField(issue: z.core.$ZodIssue): string {
  const pathField = issue.path[0];
  if (typeof pathField === 'string') return pathField;
  if (issue.code === 'unrecognized_keys') return issue.keys[0] ?? 'row';
  return 'row';
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function splitList(value: string): string[] {
  return normalizeText(value)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseDateAdded(value: string): string {
  const match = value.match(/^([A-Z][a-z]{2})\.?\s+(\d{1,2}),\s*(\d{4})$/);
  const months: Record<string, string> = {
    Jan: '01',
    Feb: '02',
    Mar: '03',
    Apr: '04',
    May: '05',
    Jun: '06',
    Jul: '07',
    Aug: '08',
    Sep: '09',
    Oct: '10',
    Nov: '11',
    Dec: '12',
  };
  const month = match?.[1] ? months[match[1]] : undefined;
  const day = match?.[2];
  const year = match?.[3];
  if (!month || !day || !year) {
    throw new Error(`Date Added: invalid date: ${value}`);
  }

  const iso = `${year}-${month}-${day.padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== iso
  ) {
    throw new Error(`Date Added: invalid date: ${value}`);
  }
  return iso;
}

function protocolShortName(value: string): string {
  return normalizeText(value).replace(/_+$/, '').replaceAll('_', ' ');
}

function assetPath(assetFilename: string): string {
  return `${publicAssetRoot}/${encodeURIComponent(assetFilename)}`;
}

function staleError(column: string, detail: string): Error {
  return new Error(`${column}: ${detail}; run ${SYNC_COMMAND}`);
}

function parseStagesCell(row: ProtocolRow, wave: number): ProtocolStage[] {
  const column = stagesColumn(wave);
  const raw = row[column];
  if (!raw) throw staleError(column, 'missing');

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw staleError(column, 'not valid JSON');
  }

  const parsed = stagesCellSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `${column}: ${issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid'}`,
    );
  }

  const stages = parsed.data;
  if (row[stageCountColumn(wave)] !== String(stages.length)) {
    throw staleError(stageCountColumn(wave), 'does not match the stage list');
  }
  if (
    row[edgeStagesColumn(wave)] !== serializeEdgeStages(summarizeStages(stages))
  ) {
    throw staleError(edgeStagesColumn(wave), 'does not match the stage list');
  }
  if (!row[schemaVersionColumn(wave)]) {
    throw staleError(schemaVersionColumn(wave), 'missing');
  }

  return stages;
}

function assertWaveUnused(row: ProtocolRow, wave: number): void {
  for (const column of [
    schemaVersionColumn(wave),
    stageCountColumn(wave),
    edgeStagesColumn(wave),
    stagesColumn(wave),
  ]) {
    if (row[column]) {
      throw staleError(column, `set although wave ${wave} has no protocol`);
    }
  }
}

function buildDownloads(
  row: ProtocolRow,
  waves: readonly number[],
): ProtocolDownload[] {
  const downloads: ProtocolDownload[] = [];

  for (const wave of waves) {
    const protocol = row[protocolAssetColumn(wave)] ?? '';
    const codebook = row[codebookAssetColumn(wave)] ?? '';
    if (!protocol && !codebook) {
      assertWaveUnused(row, wave);
      continue;
    }
    if (!protocol || !codebook) {
      throw new Error(`Wave ${wave}: protocol and codebook must be paired`);
    }
    downloads.push({
      wave,
      protocolFilename: protocol,
      protocolPath: assetPath(protocol),
      codebookFilename: codebook,
      codebookPath: assetPath(codebook),
      stages: parseStagesCell(row, wave),
    });
  }

  if (row[WAVES_COLUMN] !== String(downloads.length)) {
    throw staleError(WAVES_COLUMN, `expected ${downloads.length}`);
  }

  return downloads;
}

function buildSupplementaryMaterials(
  row: ProtocolRow,
): ProtocolSupplementaryMaterial[] {
  const label = row['Supplementary Material Label'];
  const materialFilename = row['Supplementary Material (asset)'];

  if (!label && !materialFilename) return [];
  if (!label || !materialFilename) {
    throw new Error(
      'Supplementary material: label and filename must be paired',
    );
  }

  return [
    {
      filename: materialFilename,
      path: assetPath(materialFilename),
      label,
    },
  ];
}

async function assertAssetsExist(
  assetFilenames: string[],
  assetDirectory: string,
): Promise<void> {
  await Promise.all(
    assetFilenames.map(async (assetFilename) => {
      try {
        await access(join(assetDirectory, assetFilename));
      } catch (error) {
        throw new Error(`Missing gallery asset: ${assetFilename}`, {
          cause: error,
        });
      }
    }),
  );
}

const galleryCache = new Map<string, Promise<GalleryProtocol[]>>();

export function loadProtocolGallery(
  contentFile = join(process.cwd(), 'content', 'protocol-gallery.csv'),
  assetDirectory = join(
    process.cwd(),
    'public',
    'protocols',
    'protocol-gallery',
  ),
): Promise<GalleryProtocol[]> {
  if (process.env.NODE_ENV === 'development') {
    return readProtocolGallery(contentFile, assetDirectory);
  }

  const key = `${contentFile}\n${assetDirectory}`;
  const cached = galleryCache.get(key);
  if (cached) return cached;

  const pending = readProtocolGallery(contentFile, assetDirectory);
  galleryCache.set(key, pending);
  pending.catch(() => galleryCache.delete(key));
  return pending;
}

function rowError(index: number, error: unknown): Error {
  const message = error instanceof Error ? error.message : 'invalid row';
  return new Error(`protocol-gallery.csv: row ${index + 2}: ${message}`, {
    cause: error,
  });
}

async function readProtocolGallery(
  contentFile: string,
  assetDirectory: string,
): Promise<GalleryProtocol[]> {
  let source: string;
  try {
    source = await readFile(contentFile, 'utf8');
  } catch (error) {
    throw new Error('protocol-gallery.csv: unable to read dataset', {
      cause: error,
    });
  }

  let parsed: unknown;
  try {
    parsed = await csv().fromString(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid CSV';
    throw new Error(`protocol-gallery.csv: ${message}`, { cause: error });
  }

  const records = csvRowsSchema.safeParse(parsed);
  const firstRecord = records.success ? records.data[0] : undefined;
  if (!records.success || !firstRecord) {
    throw new Error(
      'protocol-gallery.csv: dataset must contain at least one row',
    );
  }

  if (!(WAVES_COLUMN in firstRecord)) {
    throw new Error(
      `protocol-gallery.csv: ${WAVES_COLUMN} column missing; run ${SYNC_COMMAND}`,
    );
  }
  const waves = discoverWaves(Object.keys(firstRecord));
  const waveSchema = waveColumnSchema(waves);

  const rows = records.data.map((record, index) => {
    try {
      return parseRow(record, waveSchema);
    } catch (error) {
      throw rowError(index, error);
    }
  });

  const seenSlugs = new Set<string>();
  const pendingRows = rows.map((row, index) => {
    try {
      if (seenSlugs.has(row.Slug)) throw new Error('Slug: duplicate slug');
      seenSlugs.add(row.Slug);

      return {
        row,
        downloads: buildDownloads(row, waves),
        supplementaryMaterials: buildSupplementaryMaterials(row),
      };
    } catch (error) {
      throw rowError(index, error);
    }
  });

  await assertAssetsExist(
    pendingRows.flatMap(({ downloads, supplementaryMaterials }) => [
      ...downloads.flatMap((download) => [
        download.protocolFilename,
        download.codebookFilename,
      ]),
      ...supplementaryMaterials.map(
        ({ filename: materialFilename }) => materialFilename,
      ),
    ]),
    assetDirectory,
  );

  return pendingRows.map<GalleryProtocol>(
    ({ row, downloads, supplementaryMaterials }) => {
      const title = normalizeText(row['Study Title']);
      const shortName = protocolShortName(
        row['Protocol Title [StudyAcronym_DatePublishedtoPG]'],
      );
      const authors = normalizeText(row['Protocol Authors']);
      const fields = splitList(row['Field(s)']);
      const population = normalizeText(row.Population);
      const edgeGeneration = splitList(row['Edge Generation Methodology']);
      const description = normalizeText(row['Descriptive Sentence']);

      return {
        slug: row.Slug,
        title,
        shortName,
        authors,
        studyPi: normalizeText(row['Study PI']),
        contact: normalizeText(row['Protocol Contact']),
        citation: row['Cite Publication'].trim(),
        publicationUrl: row['Publication URL'],
        grantNumber: normalizeText(row['Grant Number']),
        clinicalTrialsRegistration: normalizeText(
          row['Clinical Trials Registration'],
        ),
        fields,
        population,
        edgeGeneration,
        usesRosters: row['Uses Rosters'] === 'yes',
        summary: normalizeText(row['Qualitative Summary']),
        description,
        sandboxUrl: row.Fresco || undefined,
        featured: row.Featured === 'yes',
        dateAdded: parseDateAdded(row['Date Added']),
        searchText: [
          shortName,
          title,
          authors,
          ...fields,
          population,
          ...edgeGeneration,
          description,
        ]
          .join(' ')
          .toLocaleLowerCase('en'),
        downloads,
        supplementaryMaterials,
      };
    },
  );
}

export async function getProtocolBySlug(
  requestedSlug: string,
): Promise<GalleryProtocol | undefined> {
  const protocols = await loadProtocolGallery();
  return protocols.find((protocol) => protocol.slug === requestedSlug);
}
