import { sql } from 'drizzle-orm';
import {
  bytea,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { teamIsolationPolicy, tenantTablesSql } from '@codaco/studio-sync/rls';
import { drafts, sections } from '@codaco/studio-sync/schema';

import { teams } from '../db/auth-schema.ts';

const protocols = pgTable(
  'protocols',
  {
    id: uuid('id').primaryKey(),
    // No cascade: a team's sync-side rows carry team_id without a foreign key,
    // so no delete of a team row could ever be complete. Team deletion is
    // refused outright in src/auth/better-auth.ts; this FK is the backstop.
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    index('protocols_team_id_idx').on(table.teamId),
    teamIsolationPolicy(),
  ],
);

const protocolVersions = pgTable(
  'protocol_versions',
  {
    id: uuid('id').primaryKey(),
    protocolId: uuid('protocol_id').notNull(),
    teamId: text('team_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    label: text('label'),
    versionHash: text('version_hash').notNull(),
    manifest: jsonb('manifest').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    // No FK: draft rows are discardable.
    sourceDraftId: uuid('source_draft_id'),
    sourceManifestHash: text('source_manifest_hash').notNull(),
    migratedFromVersionId: uuid('migrated_from_version_id'),
    publishedAt: timestamp('published_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.protocolId, table.versionNumber),
    unique().on(table.protocolId, table.versionHash),
    unique().on(table.id, table.teamId),
    foreignKey({
      columns: [table.protocolId, table.teamId],
      foreignColumns: [protocols.id, protocols.teamId],
    }),
    foreignKey({
      columns: [table.migratedFromVersionId, table.teamId],
      foreignColumns: [table.id, table.teamId],
    }),
    teamIsolationPolicy(),
  ],
);

// The GC pin set: the FK into sections makes sweeping a pinned section
// structurally impossible.
const versionSections = pgTable(
  'version_sections',
  {
    versionId: uuid('version_id').notNull(),
    teamId: text('team_id').notNull(),
    sectionId: text('section_id').notNull(),
    sectionHash: text('section_hash').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.versionId, table.sectionId] }),
    foreignKey({
      columns: [table.versionId, table.teamId],
      foreignColumns: [protocolVersions.id, protocolVersions.teamId],
    }),
    foreignKey({
      columns: [table.teamId, table.sectionHash],
      foreignColumns: [sections.teamId, sections.hash],
    }),
    index('version_sections_team_id_section_hash_idx').on(
      table.teamId,
      table.sectionHash,
    ),
    teamIsolationPolicy(),
  ],
);

const protocolDrafts = pgTable(
  'protocol_drafts',
  {
    draftId: uuid('draft_id').primaryKey(),
    teamId: text('team_id').notNull(),
    protocolId: uuid('protocol_id').notNull(),
    basedOnVersionId: uuid('based_on_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.draftId, table.teamId],
      foreignColumns: [drafts.id, drafts.teamId],
    }),
    foreignKey({
      columns: [table.protocolId, table.teamId],
      foreignColumns: [protocols.id, protocols.teamId],
    }),
    foreignKey({
      columns: [table.basedOnVersionId, table.teamId],
      foreignColumns: [protocolVersions.id, protocolVersions.teamId],
    }),
    teamIsolationPolicy(),
  ],
);

/**
 * The sealed value of every `apikey` protocol asset (#1900).
 *
 * Beside the protocol line rather than in the `assets` section document,
 * because a section document is content-addressed, copied into every manifest
 * revision and pinned by every version published from it — a key written there
 * would be at rest in as many rows as the protocol has revisions, and would
 * come back out of every read that returns a section. Keyed by the asset
 * rather than by the revision that wrote it: a researcher replacing a key
 * replaces the row, and the versions that pinned the old manifest go on
 * assembling with the current one, which is what a rotated third-party key
 * has to do.
 *
 * Rows are never deleted when an asset leaves a manifest: a published version
 * still names the revision that had it, and that version must go on assembling
 * for a participant.
 */
const protocolAssetKeys = pgTable(
  'protocol_asset_keys',
  {
    teamId: text('team_id').notNull(),
    protocolId: uuid('protocol_id').notNull(),
    /** The asset's key in the manifest, which is the id the AAD binds. */
    assetId: text('asset_id').notNull(),
    // AES-256-GCM ciphertext under AAD ['asset-key', team, protocol, asset],
    // so a row copied to another protocol or asset stops opening.
    ciphertext: bytea('ciphertext').notNull(),
    // Names the key that produced the ciphertext, so rotation is per row.
    keyId: text('key_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.teamId, table.protocolId, table.assetId],
    }),
    foreignKey({
      columns: [table.protocolId, table.teamId],
      foreignColumns: [protocols.id, protocols.teamId],
    }),
    check(
      'protocol_asset_keys_lengths_check',
      sql`char_length(${table.keyId}) BETWEEN 1 AND 64
          AND octet_length(${table.ciphertext}) BETWEEN 1 AND 4096
          AND char_length(${table.assetId}) BETWEEN 1 AND 255`,
    ),
    teamIsolationPolicy(),
  ],
);

export const PROTOCOL_TABLES = {
  protocols,
  protocolVersions,
  versionSections,
  protocolDrafts,
  protocolAssetKeys,
};

// Hashed into the schema fingerprint — whitespace counts. CREATE OR REPLACE
// because DROP TABLE CASCADE leaves functions behind, and an `already exists`
// error reads as transient to the boot retry loop.
export const PROTOCOL_SIDECAR_SQL = `
CREATE OR REPLACE FUNCTION protocol_versions_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'published protocol versions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER protocol_versions_immutable
  BEFORE UPDATE OR DELETE ON protocol_versions
  FOR EACH ROW EXECUTE FUNCTION protocol_versions_are_immutable();

CREATE OR REPLACE TRIGGER version_sections_immutable
  BEFORE UPDATE OR DELETE ON version_sections
  FOR EACH ROW EXECUTE FUNCTION protocol_versions_are_immutable();

-- Inserting a pin after publication would change what the version assembles to
-- while its frozen manifest and hash stayed unchanged.
CREATE OR REPLACE FUNCTION version_sections_pins_are_frozen() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM protocol_versions v
    WHERE v.id = NEW.version_id
      AND v.xmin = pg_current_xact_id()::xid
  ) THEN
    RAISE EXCEPTION 'published protocol versions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER version_sections_insert_frozen
  BEFORE INSERT ON version_sections
  FOR EACH ROW EXECUTE FUNCTION version_sections_pins_are_frozen();

-- The backstop under every path that writes an assets section (#1900). The
-- application strips an API key's value and seals it in protocol_asset_keys
-- before the document is hashed; this is what makes "no key is ever at rest in
-- a section" a property of the database rather than a property of every caller
-- remembering to. Sections are immutable once written, so BEFORE INSERT is the
-- whole of the write path.
--
-- Shaped as "an entry that says it is an apikey and carries a value" rather
-- than keyed on the section id, because the section id is not a column here
-- and a document is the same document whichever section names it.
CREATE OR REPLACE FUNCTION sections_hold_no_asset_keys() RETURNS trigger AS $$
BEGIN
  IF jsonb_typeof(NEW.doc) = 'object' AND EXISTS (
    SELECT 1 FROM jsonb_each(NEW.doc) AS entry
    WHERE jsonb_typeof(entry.value) = 'object'
      AND entry.value ->> 'type' = 'apikey'
      AND entry.value ? 'value'
  ) THEN
    RAISE EXCEPTION 'protocol asset API keys must be sealed in protocol_asset_keys, not stored in a section document';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER sections_hold_no_asset_keys
  BEFORE INSERT ON sections
  FOR EACH ROW EXECUTE FUNCTION sections_hold_no_asset_keys();
${tenantTablesSql(['protocols', 'protocol_versions', 'version_sections', 'protocol_drafts', 'protocol_asset_keys'])}
`;
