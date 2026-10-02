import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import csv from 'csvtojson';
import { z } from 'zod';

import type { Locale } from '~/lib/i18n/locales';
import {
  type UpdateAppId,
  updateAppIds,
  type UpdateKind,
  updateKinds,
} from '~/lib/updateApps';

export type NewsItem = { id: string; title: string; href: string };

export type Publication = {
  id: string;
  title: string;
  source: string;
  authors: string;
  href: string;
  year: string;
};

export type Grant = {
  id: string;
  title: string;
  pis: string;
  description: string;
  logo: string;
  logoAlt: string;
  href: string;
};

export type TeamMember = {
  id: string;
  name: string;
  institution: string;
  photo: string;
};

export type UpdateVersion = { app: UpdateAppId; version?: string };

export type Update = {
  id: string;
  date: string;
  kind: UpdateKind;
  versions: UpdateVersion[];
  apps: UpdateAppId[];
  title: string;
  summary: string;
  details?: string;
  link?: string;
};

export type SiteContent = {
  newsItems: NewsItem[];
  publications: Publication[];
  grants: Grant[];
  coreTeam: TeamMember[];
};

const id = z.string().trim().min(1);
const requiredText = z.string().trim().min(1);
const httpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), 'must use HTTPS');
const internalPath = z
  .string()
  .regex(/^\/(?![\\/])[^\\\s]*$/, 'must be a root-relative path');
const publicImage = z
  .string()
  .regex(/^\/images\/.+/, 'must start with /images/');
const publicationYear = z
  .string()
  .trim()
  .regex(/^\d{4}$/, 'must be a four-digit year');

const newsRowSchema = z
  .object({
    id,
    'title_en': requiredText,
    'title_es': requiredText,
    'title_zh-Hans': requiredText,
    'title_zh-Hant': requiredText,
    'title_de': requiredText,
    'title_nl': requiredText,
    'title_pt-BR': requiredText,
    'title_it': requiredText,
    'title_fr': requiredText,
    'href': z.union([httpsUrl, internalPath]),
  })
  .strict();

const publicationRowSchema = z
  .object({
    id,
    'title_en': requiredText,
    'title_es': requiredText,
    'title_zh-Hans': requiredText,
    'title_zh-Hant': requiredText,
    'title_de': requiredText,
    'title_nl': requiredText,
    'title_pt-BR': requiredText,
    'title_it': requiredText,
    'title_fr': requiredText,
    'source_en': requiredText,
    'source_es': requiredText,
    'source_zh-Hans': requiredText,
    'source_zh-Hant': requiredText,
    'source_de': requiredText,
    'source_nl': requiredText,
    'source_pt-BR': requiredText,
    'source_it': requiredText,
    'source_fr': requiredText,
    'authors': requiredText,
    'href': httpsUrl,
    'year': publicationYear,
  })
  .strict();

const grantRowSchema = z
  .object({
    id,
    'title_en': requiredText,
    'title_es': requiredText,
    'title_zh-Hans': requiredText,
    'title_zh-Hant': requiredText,
    'title_de': requiredText,
    'title_nl': requiredText,
    'title_pt-BR': requiredText,
    'title_it': requiredText,
    'title_fr': requiredText,
    'pis_en': requiredText,
    'pis_es': requiredText,
    'pis_zh-Hans': requiredText,
    'pis_zh-Hant': requiredText,
    'pis_de': requiredText,
    'pis_nl': requiredText,
    'pis_pt-BR': requiredText,
    'pis_it': requiredText,
    'pis_fr': requiredText,
    'description_en': requiredText,
    'description_es': requiredText,
    'description_zh-Hans': requiredText,
    'description_zh-Hant': requiredText,
    'description_de': requiredText,
    'description_nl': requiredText,
    'description_pt-BR': requiredText,
    'description_it': requiredText,
    'description_fr': requiredText,
    'logo': publicImage,
    'logo_alt_en': requiredText,
    'logo_alt_es': requiredText,
    'logo_alt_zh-Hans': requiredText,
    'logo_alt_zh-Hant': requiredText,
    'logo_alt_de': requiredText,
    'logo_alt_nl': requiredText,
    'logo_alt_pt-BR': requiredText,
    'logo_alt_it': requiredText,
    'logo_alt_fr': requiredText,
    'href': httpsUrl,
  })
  .strict();

const teamMemberRowSchema = z
  .object({
    id,
    'name': requiredText,
    'institution_en': requiredText,
    'institution_es': requiredText,
    'institution_zh-Hans': requiredText,
    'institution_zh-Hant': requiredText,
    'institution_de': requiredText,
    'institution_nl': requiredText,
    'institution_pt-BR': requiredText,
    'institution_it': requiredText,
    'institution_fr': requiredText,
    'photo': publicImage,
  })
  .strict();

const isoDate = z.iso.date();

const updateRowSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a URL slug'),
    date: isoDate,
    kind: z.enum(updateKinds),
    versions: z
      .string()
      .transform((value) =>
        value.split('|').map((entry) => {
          const [app = '', version] = entry.trim().split('@');
          return version ? { app, version } : { app };
        }),
      )
      .pipe(
        z
          .array(
            z.object({
              app: z.enum(updateAppIds),
              version: z
                .string()
                .regex(
                  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/,
                  'must be a semver version',
                )
                .optional(),
            }),
          )
          .min(1)
          .refine(
            (versions) =>
              new Set(versions.map(({ app }) => app)).size === versions.length,
            'must not repeat an app',
          ),
      ),
    title: requiredText,
    summary: requiredText,
    details: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined),
    link: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined)
      .pipe(internalPath.optional()),
  })
  .strict();

const csvRowsSchema = z.array(z.record(z.string(), z.string()));

function issueField(issue: z.core.$ZodIssue): string {
  const pathField = issue.path[0];
  if (typeof pathField === 'string') return pathField;
  if (issue.code === 'unrecognized_keys') return issue.keys[0] ?? 'row';
  return 'row';
}

async function parseCsv<Row extends { id: string }>(
  directory: string,
  filename: string,
  schema: z.ZodType<Row>,
): Promise<Row[]> {
  let source: string;
  try {
    source = await readFile(join(directory, filename), 'utf8');
  } catch {
    throw new Error(`${filename}: dataset must contain at least one row`);
  }

  let parsed: unknown;
  try {
    parsed = await csv().fromString(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid CSV';
    throw new Error(`${filename}: ${message}`, { cause: error });
  }

  const records = csvRowsSchema.safeParse(parsed);
  if (!records.success) {
    throw new Error(`${filename}: invalid CSV records`);
  }
  if (records.data.length === 0) {
    throw new Error(`${filename}: dataset must contain at least one row`);
  }

  const rows = records.data.map((record, index) => {
    const result = schema.safeParse(record);
    if (result.success) return result.data;

    const issue = result.error.issues[0];
    if (!issue) throw new Error(`${filename}: row ${index + 2}: invalid row`);
    throw new Error(
      `${filename}: row ${index + 2}: ${issueField(issue)}: ${issue.message}`,
    );
  });

  const seenIds = new Set<string>();
  rows.forEach((row, index) => {
    if (seenIds.has(row.id)) {
      throw new Error(`${filename}: row ${index + 2}: id: duplicate id`);
    }
    seenIds.add(row.id);
  });

  return rows;
}

function localized(
  locale: Locale,
  english: string,
  spanish: string,
  simplifiedChinese: string,
  traditionalChinese: string,
  german: string,
  dutch: string,
  brazilianPortuguese: string,
  italian: string,
  french: string,
): string {
  if (locale === 'es') return spanish;
  if (locale === 'zh-Hans') return simplifiedChinese;
  if (locale === 'zh-Hant') return traditionalChinese;
  if (locale === 'de') return german;
  if (locale === 'nl') return dutch;
  if (locale === 'pt-BR') return brazilianPortuguese;
  if (locale === 'it') return italian;
  if (locale === 'fr') return french;
  return english;
}

export async function loadSiteContent(
  locale: Locale,
  contentDirectory = join(process.cwd(), 'content'),
): Promise<SiteContent> {
  const [newsRows, publicationRows, grantRows, teamRows] = await Promise.all([
    parseCsv(contentDirectory, 'latest-news.csv', newsRowSchema),
    parseCsv(contentDirectory, 'publications.csv', publicationRowSchema),
    parseCsv(contentDirectory, 'grants.csv', grantRowSchema),
    parseCsv(contentDirectory, 'core-team.csv', teamMemberRowSchema),
  ]);

  return {
    newsItems: newsRows.map((row) => ({
      id: row.id,
      title: localized(
        locale,
        row.title_en,
        row.title_es,
        row['title_zh-Hans'],
        row['title_zh-Hant'],
        row.title_de,
        row.title_nl,
        row['title_pt-BR'],
        row.title_it,
        row.title_fr,
      ),
      href: row.href,
    })),
    publications: publicationRows.map((row) => ({
      id: row.id,
      title: localized(
        locale,
        row.title_en,
        row.title_es,
        row['title_zh-Hans'],
        row['title_zh-Hant'],
        row.title_de,
        row.title_nl,
        row['title_pt-BR'],
        row.title_it,
        row.title_fr,
      ),
      source: localized(
        locale,
        row.source_en,
        row.source_es,
        row['source_zh-Hans'],
        row['source_zh-Hant'],
        row.source_de,
        row.source_nl,
        row['source_pt-BR'],
        row.source_it,
        row.source_fr,
      ),
      authors: row.authors,
      href: row.href,
      year: row.year,
    })),
    grants: grantRows.map((row) => ({
      id: row.id,
      title: localized(
        locale,
        row.title_en,
        row.title_es,
        row['title_zh-Hans'],
        row['title_zh-Hant'],
        row.title_de,
        row.title_nl,
        row['title_pt-BR'],
        row.title_it,
        row.title_fr,
      ),
      pis: localized(
        locale,
        row.pis_en,
        row.pis_es,
        row['pis_zh-Hans'],
        row['pis_zh-Hant'],
        row.pis_de,
        row.pis_nl,
        row['pis_pt-BR'],
        row.pis_it,
        row.pis_fr,
      ),
      description: localized(
        locale,
        row.description_en,
        row.description_es,
        row['description_zh-Hans'],
        row['description_zh-Hant'],
        row.description_de,
        row.description_nl,
        row['description_pt-BR'],
        row.description_it,
        row.description_fr,
      ),
      logo: row.logo,
      logoAlt: localized(
        locale,
        row.logo_alt_en,
        row.logo_alt_es,
        row['logo_alt_zh-Hans'],
        row['logo_alt_zh-Hant'],
        row.logo_alt_de,
        row.logo_alt_nl,
        row['logo_alt_pt-BR'],
        row.logo_alt_it,
        row.logo_alt_fr,
      ),
      href: row.href,
    })),
    coreTeam: teamRows.map((row) => ({
      id: row.id,
      name: row.name,
      institution: localized(
        locale,
        row.institution_en,
        row.institution_es,
        row['institution_zh-Hans'],
        row['institution_zh-Hant'],
        row.institution_de,
        row.institution_nl,
        row['institution_pt-BR'],
        row.institution_it,
        row.institution_fr,
      ),
      photo: row.photo,
    })),
  };
}

export async function loadUpdates(
  contentDirectory = join(process.cwd(), 'content'),
): Promise<Update[]> {
  const rows = await parseCsv(contentDirectory, 'updates.csv', updateRowSchema);

  return rows
    .filter((row) => row.versions.some(({ version }) => version))
    .map((row) => ({
      id: row.id,
      date: row.date,
      kind: row.kind,
      versions: row.versions,
      apps: row.versions.map(({ app }) => app),
      title: row.title,
      summary: row.summary,
      ...(row.details ? { details: row.details } : {}),
      ...(row.link ? { link: row.link } : {}),
    }))
    .toSorted((a, b) => b.date.localeCompare(a.date));
}
