// Protocol assets (#1278). The bytes live in the object store (src/assets.ts);
// these two rows are the metadata, provenance, and reference graph Postgres
// holds. `assets` mirrors `sections`: content-addressed, deduplicated per team,
// never shared across the tenant boundary. `asset_references` is the pin set,
// and it *is* the reference count — a stored counter drifts under concurrent
// commits and cannot make a referenced asset structurally undeletable.
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { teamIsolationPolicy, tenantTablesSql } from '@codaco/studio-sync/rls';

// One row per (team, content hash): the media type, size, original filename,
// provenance and sweep marker for a stored object.
const assets = pgTable(
  'assets',
  {
    teamId: text('team_id').notNull(),
    // sha256 of the bytes, lowercase hex — the same digest src/assets.ts
    // computes and the same value that keys the object store.
    hash: text('hash').notNull(),
    mediaType: text('media_type').notNull(),
    mediaClass: text('media_class').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    originalFilename: text('original_filename').notNull(),
    origin: text('origin').notNull(),
    // No FK: an asset must outlive the account that uploaded it, and the
    // uploader may be a system principal or a registry import.
    uploadedByUserId: text('uploaded_by_user_id'),
    // Structure of a roster CSV: column names and row count, so #1277 can
    // validate bindings without re-reading the object.
    datasetMetadata: jsonb('dataset_metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    unreferencedAt: timestamp('unreferenced_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.hash] }),
    index('assets_team_id_unreferenced_at_idx')
      .on(table.teamId, table.unreferencedAt)
      .where(sql`unreferenced_at is not null`),
    index('assets_team_id_media_class_idx').on(table.teamId, table.mediaClass),
    check('assets_hash_check', sql`${table.hash} ~ '^[0-9a-f]{64}$'`),
    check(
      'assets_media_type_check',
      sql`${table.mediaType} ~ '^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$'`,
    ),
    check(
      'assets_media_class_check',
      sql`${table.mediaClass} IN ('image', 'audio', 'video', 'document', 'dataset')`,
    ),
    // 1 byte to 2 GiB. The database ceiling is the backstop; the tunable
    // per-class cap lives in env and is enforced by the upload route.
    check(
      'assets_byte_size_check',
      sql`${table.byteSize} BETWEEN 1 AND 2147483648`,
    ),
    check(
      'assets_original_filename_check',
      sql`char_length(${table.originalFilename}) BETWEEN 1 AND 255
          AND ${table.originalFilename} !~ '[/\\\\]'
          AND ${table.originalFilename} ~ '[^[:space:]]'`,
    ),
    check(
      'assets_origin_check',
      sql`${table.origin} IN ('upload', 'template_import', 'registry_import', 'seed')`,
    ),
    check(
      'assets_dataset_metadata_check',
      sql`${table.datasetMetadata} IS NULL
          OR (${table.mediaClass} = 'dataset' AND jsonb_typeof(${table.datasetMetadata}) = 'object')`,
    ),
    check(
      'assets_uploaded_by_user_id_check',
      sql`${table.uploadedByUserId} IS NULL
          OR char_length(${table.uploadedByUserId}) BETWEEN 1 AND 255`,
    ),
    teamIsolationPolicy(),
  ],
);

// The pin set. One row per (asset, referrer). A referenced asset cannot be
// deleted, because the FK points at `assets`; garbage collection sweeps assets
// with no surviving pin, exactly as protocol/gc.ts sweeps sections.
//
// There is deliberately no FK to the referrer: referrers are heterogeneous (a
// section hash, a version uuid, a document uuid) and a conditional FK is not
// expressible. The GC `referenced` predicate re-validates the referrer per
// kind, as gc.ts already re-derives section references.
const assetReferences = pgTable(
  'asset_references',
  {
    teamId: text('team_id').notNull(),
    assetHash: text('asset_hash').notNull(),
    referrerKind: text('referrer_kind').notNull(),
    referrerId: text('referrer_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    primaryKey({
      columns: [
        table.teamId,
        table.assetHash,
        table.referrerKind,
        table.referrerId,
      ],
    }),
    foreignKey({
      name: 'asset_references_asset_fk',
      columns: [table.teamId, table.assetHash],
      foreignColumns: [assets.teamId, assets.hash],
    }),
    index('asset_references_team_id_referrer_idx').on(
      table.teamId,
      table.referrerKind,
      table.referrerId,
    ),
    check(
      'asset_references_referrer_kind_check',
      sql`${table.referrerKind} IN ('section', 'protocol_version', 'template_version', 'consent_document', 'message_template')`,
    ),
    check(
      'asset_references_referrer_id_check',
      sql`char_length(${table.referrerId}) BETWEEN 1 AND 255`,
    ),
    teamIsolationPolicy(),
  ],
);

export const ASSET_TABLES = { assets, assetReferences };

// Hashed into the schema fingerprint — whitespace counts. CREATE OR REPLACE
// because DROP TABLE CASCADE leaves functions behind, and an `already exists`
// error reads as transient to the boot retry loop.
export const ASSET_SIDECAR_SQL = `
-- Pins belonging to an immutable published artifact are immutable too:
-- retracting one would change what a frozen version resolves to while its
-- manifest and hash stayed unchanged (the version_sections argument).
CREATE OR REPLACE FUNCTION asset_references_published_pins_are_frozen() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'published asset references are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER asset_references_published_immutable
  BEFORE UPDATE OR DELETE ON asset_references
  FOR EACH ROW
  WHEN (OLD.referrer_kind IN ('protocol_version', 'template_version', 'consent_document'))
  EXECUTE FUNCTION asset_references_published_pins_are_frozen();

-- An asset row's identity and stored representation are canonical and
-- immutable, matching the first-write-wins contract src/assets.ts already
-- enforces against the object store. Only the sweep marker may move.
CREATE OR REPLACE FUNCTION assets_metadata_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'asset metadata is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER assets_metadata_immutable
  BEFORE UPDATE ON assets
  FOR EACH ROW
  WHEN (
    NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.hash IS DISTINCT FROM OLD.hash
    OR NEW.media_type IS DISTINCT FROM OLD.media_type
    OR NEW.media_class IS DISTINCT FROM OLD.media_class
    OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
    OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
    OR NEW.origin IS DISTINCT FROM OLD.origin
    OR NEW.uploaded_by_user_id IS DISTINCT FROM OLD.uploaded_by_user_id
    OR NEW.dataset_metadata IS DISTINCT FROM OLD.dataset_metadata
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  )
  EXECUTE FUNCTION assets_metadata_is_immutable();
${tenantTablesSql(['assets', 'asset_references'])}
`;
