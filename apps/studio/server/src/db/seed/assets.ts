// Protocol assets and gallery templates.
//
// The seed is database-only: it writes the `assets` metadata rows and their
// pin set, and uploads nothing to the object store. `hash` is still the real
// sha256 of the bytes it generated, so a later upload of the same bytes lands
// on the same key — until then `/storage/:hash` honestly 404s in development.
import { faker } from '@faker-js/faker';
import type pg from 'pg';

import { canonicalize } from '@codaco/studio-sync/apply';

import { insertRows, type SeedRowValue } from './insert.ts';
import type { SeededProtocolLine, SeededVersion } from './protocols.ts';
import { pickSome, seedTime, seedUuid, sha256Hex, shiftDays } from './rng.ts';
import type { SeedConsentDocument, SeedStudy } from './studies.ts';
import type { SeedTeam } from './teams.ts';

const TEMPLATE_KINDS = [
  'protocol',
  'stage',
  'entity_definition',
  'variable_set',
  'generator_prompt_set',
] as const;

/** The smallest valid PNG: an 8-bit greyscale 1x1 image. */
function onePixelPng(): Buffer {
  return Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108000000003a7e9b55' +
      '0000000a4944415408d76360000000020001e221bc330000000049454e44ae426082',
    'hex',
  );
}

/** A 44-byte RIFF/WAVE header followed by a short run of silence. */
function silentWav(sampleCount: number): Buffer {
  const data = Buffer.alloc(sampleCount * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(16_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function rosterCsv(): { bytes: Buffer; columns: string[]; rowCount: number } {
  const columns = ['name', 'nickname', 'age', 'relationship'];
  const rows = Array.from({ length: 8 }, () =>
    [
      faker.person.fullName(),
      faker.person.firstName(),
      String(faker.number.int({ min: 18, max: 84 })),
      faker.helpers.arrayElement([
        'friend',
        'family',
        'colleague',
        'neighbour',
      ]),
    ].join(','),
  );
  return {
    bytes: Buffer.from([columns.join(','), ...rows].join('\n'), 'utf8'),
    columns,
    rowCount: rows.length,
  };
}

type AssetShape = {
  bytes: Buffer;
  mediaType: string;
  mediaClass: string;
  filename: string;
  datasetMetadata: Record<string, unknown> | null;
};

/**
 * `assets` is keyed by (team_id, hash), so no two of a team's assets may carry
 * the same bytes: one image per team, and every audio file a distinct length.
 */
function assetShape(index: number): AssetShape {
  if (index === 0) {
    return {
      bytes: onePixelPng(),
      mediaType: 'image/png',
      mediaClass: 'image',
      filename: `${faker.word.adjective()}-backdrop.png`,
      datasetMetadata: null,
    };
  }
  if (index % 2 === 1) {
    return {
      bytes: silentWav(400 + index * 137),
      mediaType: 'audio/wav',
      mediaClass: 'audio',
      filename: `prompt-audio-${index}.wav`,
      datasetMetadata: null,
    };
  }
  const csv = rosterCsv();
  return {
    bytes: csv.bytes,
    mediaType: 'text/csv',
    mediaClass: 'dataset',
    filename: `roster-${index}.csv`,
    datasetMetadata: { columns: csv.columns, rowCount: csv.rowCount },
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type SeededTemplateVersion = {
  templateId: string;
  versionId: string;
  /** When the version was frozen: nothing pinned to it is dated after this. */
  publishedAt: Date;
};

/**
 * Two to five templates per team, each with one published version whose
 * sections are the team's own — the content-addressed store is shared with
 * protocols, so a template version pins section hashes that already exist.
 */
export async function seedTemplates(
  client: pg.PoolClient,
  team: SeedTeam,
  line: SeededProtocolLine,
): Promise<SeededTemplateVersion[]> {
  const templateRows: SeedRowValue[][] = [];
  const versionRows: SeedRowValue[][] = [];
  const pinRows: SeedRowValue[][] = [];
  const created: SeededTemplateVersion[] = [];

  const count = faker.number.int({ min: 2, max: 5 });
  const createdAt = seedTime(-300 + team.index);
  for (let index = 0; index < count; index++) {
    const templateId = seedUuid();
    // Every kind appears across the corpus; curation and the CC0 licence are
    // both represented in every team.
    const kind = TEMPLATE_KINDS[(team.index + index) % TEMPLATE_KINDS.length]!;
    templateRows.push([
      templateId,
      team.id,
      kind,
      `${faker.commerce.productAdjective()} ${kind.replace(/_/g, ' ')} template`,
      faker.lorem.sentence(),
      index === 0 ? 'CC0-1.0' : 'CC-BY-4.0',
      index === 0,
      'published',
      JSON.stringify({
        authors: [faker.person.fullName()],
        keywords: faker.helpers.arrayElements(
          ['ego networks', 'health', 'mobility', 'support', 'pilot'],
          2,
        ),
        doi: `10.5281/zenodo.${faker.number.int({ min: 1_000_000, max: 9_999_999 })}`,
      }),
      team.adminUserId,
      shiftDays(createdAt, index),
      shiftDays(createdAt, index + 1),
    ]);

    const versionId = seedUuid();
    const publishedAt = shiftDays(createdAt, index + 1);
    const source = line.versions[index % 2]!;
    const pinned = Object.fromEntries(
      pickSome(Object.entries(source.sectionHashes), 4),
    );
    // Canonical, so the hash can be recomputed from the jsonb as read back.
    const manifestHash = sha256Hex(canonicalize(pinned));
    versionRows.push([
      versionId,
      team.id,
      templateId,
      1,
      JSON.stringify(pinned),
      manifestHash,
      source.schemaVersion,
      publishedAt,
    ]);
    for (const [sectionId, sectionHash] of Object.entries(pinned)) {
      pinRows.push([versionId, team.id, sectionId, sectionHash]);
    }
    created.push({ templateId, versionId, publishedAt });
  }

  await insertRows(
    client,
    'templates',
    [
      'id',
      'team_id',
      'kind',
      'name',
      'summary',
      'license',
      'curated',
      'state',
      'metadata',
      'author_user_id',
      'created_at',
      'updated_at',
    ],
    templateRows,
  );
  await insertRows(
    client,
    'template_versions',
    [
      'id',
      'team_id',
      'template_id',
      'version_number',
      'manifest',
      'manifest_hash',
      'schema_version',
      'published_at',
    ],
    versionRows,
  );
  // The pins must land in the same transaction as their version:
  // `template_version_sections_insert_frozen` proves the version's xmin.
  await insertRows(
    client,
    'template_version_sections',
    ['version_id', 'team_id', 'section_id', 'section_hash'],
    pinRows,
  );

  return created;
}

/**
 * Three to eight assets per team, each pinned by one to three referrers, with
 * roughly one in seven left unreferenced and marked for the sweep so garbage
 * collection has something to find.
 */
export async function seedAssets(
  client: pg.PoolClient,
  team: SeedTeam,
  versions: SeededVersion[],
  templates: SeededTemplateVersion[],
  consentDocuments: SeedConsentDocument[],
  studies: SeedStudy[],
): Promise<void> {
  const assetRows: SeedRowValue[][] = [];
  const referenceRows: SeedRowValue[][] = [];
  const createdAt = shiftDays(studies[0]?.createdAt ?? seedTime(-320), 5);

  const count = faker.number.int({ min: 3, max: 8 });
  for (let index = 0; index < count; index++) {
    const shape = assetShape(index);
    const hash = sha256Hex(shape.bytes);
    const unreferenced = index % 7 === 6;

    // Who pins it, chosen first: the dates below follow from the referrers.
    // A pin on a frozen version was made in the transaction that published
    // it (the insert guard admits nothing later), so the pin is dated at that
    // publication and the asset before it; a consent document takes pins
    // while it is a draft, so that pin follows the document's creation.
    type Referrer = { kind: string; id: string; pinnedAt: Date };
    const candidates: Referrer[] = [];
    for (const version of versions) {
      candidates.push({
        kind: 'protocol_version',
        id: version.versionId,
        pinnedAt: version.publishedAt,
      });
      const sectionHash = Object.values(version.sectionHashes)[index % 4];
      if (sectionHash !== undefined) {
        candidates.push({
          kind: 'section',
          id: sectionHash,
          pinnedAt: shiftDays(createdAt, index + 1),
        });
      }
    }
    for (const template of templates) {
      candidates.push({
        kind: 'template_version',
        id: template.versionId,
        pinnedAt: template.publishedAt,
      });
    }
    for (const document of consentDocuments) {
      candidates.push({
        kind: 'consent_document',
        id: document.id,
        pinnedAt: shiftDays(document.createdAt, 1),
      });
    }
    const referrers = unreferenced
      ? []
      : pickSome(candidates, faker.number.int({ min: 1, max: 3 }));
    const earliestPin = Math.min(
      shiftDays(createdAt, index + 1).getTime(),
      ...referrers.map((referrer) => referrer.pinnedAt.getTime()),
    );
    const assetCreatedAt = new Date(
      Math.min(shiftDays(createdAt, index).getTime(), earliestPin - DAY_MS),
    );

    assetRows.push([
      team.id,
      hash,
      shape.mediaType,
      shape.mediaClass,
      shape.bytes.length,
      shape.filename,
      'seed',
      team.adminUserId,
      shape.datasetMetadata === null
        ? null
        : JSON.stringify(shape.datasetMetadata),
      assetCreatedAt,
      unreferenced ? shiftDays(assetCreatedAt, 30) : null,
    ]);

    const seen = new Set<string>();
    for (const referrer of referrers) {
      const key = `${referrer.kind}:${referrer.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      referenceRows.push([
        team.id,
        hash,
        referrer.kind,
        referrer.id,
        referrer.pinnedAt,
      ]);
    }
  }

  await insertRows(
    client,
    'assets',
    [
      'team_id',
      'hash',
      'media_type',
      'media_class',
      'byte_size',
      'original_filename',
      'origin',
      'uploaded_by_user_id',
      'dataset_metadata',
      'created_at',
      'unreferenced_at',
    ],
    assetRows,
  );
  await insertRows(
    client,
    'asset_references',
    ['team_id', 'asset_hash', 'referrer_kind', 'referrer_id', 'created_at'],
    referenceRows,
  );
}
