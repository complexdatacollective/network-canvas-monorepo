import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import csv from 'csvtojson';
import { z } from 'zod';

import type { Locale } from '~/lib/i18n/locales';

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
    'title_de': requiredText,
    'href': z.union([httpsUrl, internalPath]),
  })
  .strict();

const publicationRowSchema = z
  .object({
    id,
    'title_en': requiredText,
    'title_es': requiredText,
    'title_zh-Hans': requiredText,
    'title_de': requiredText,
    'source_en': requiredText,
    'source_es': requiredText,
    'source_zh-Hans': requiredText,
    'source_de': requiredText,
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
    'title_de': requiredText,
    'pis_en': requiredText,
    'pis_es': requiredText,
    'pis_zh-Hans': requiredText,
    'pis_de': requiredText,
    'description_en': requiredText,
    'description_es': requiredText,
    'description_zh-Hans': requiredText,
    'description_de': requiredText,
    'logo': publicImage,
    'logo_alt_en': requiredText,
    'logo_alt_es': requiredText,
    'logo_alt_zh-Hans': requiredText,
    'logo_alt_de': requiredText,
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
    'institution_de': requiredText,
    'photo': publicImage,
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
  german: string,
): string {
  if (locale === 'es') return spanish;
  if (locale === 'zh-Hans') return simplifiedChinese;
  if (locale === 'de') return german;
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
        row.title_de,
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
        row.title_de,
      ),
      source: localized(
        locale,
        row.source_en,
        row.source_es,
        row['source_zh-Hans'],
        row.source_de,
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
        row.title_de,
      ),
      pis: localized(
        locale,
        row.pis_en,
        row.pis_es,
        row['pis_zh-Hans'],
        row.pis_de,
      ),
      description: localized(
        locale,
        row.description_en,
        row.description_es,
        row['description_zh-Hans'],
        row.description_de,
      ),
      logo: row.logo,
      logoAlt: localized(
        locale,
        row.logo_alt_en,
        row.logo_alt_es,
        row['logo_alt_zh-Hans'],
        row.logo_alt_de,
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
        row.institution_de,
      ),
      photo: row.photo,
    })),
  };
}
