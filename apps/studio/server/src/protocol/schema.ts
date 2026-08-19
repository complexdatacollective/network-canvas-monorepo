import {
  type AnyPgColumn,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { drafts, sections } from '@codaco/studio-sync/schema';

export const protocols = pgTable('protocols', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const protocolVersions = pgTable(
  'protocol_versions',
  {
    id: uuid('id').primaryKey(),
    protocolId: uuid('protocol_id')
      .notNull()
      .references(() => protocols.id),
    versionNumber: integer('version_number').notNull(),
    label: text('label'),
    versionHash: text('version_hash').notNull(),
    manifest: jsonb('manifest').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    // No FK: draft rows are discardable.
    sourceDraftId: uuid('source_draft_id'),
    sourceManifestHash: text('source_manifest_hash').notNull(),
    migratedFromVersionId: uuid('migrated_from_version_id').references(
      (): AnyPgColumn => protocolVersions.id,
    ),
    publishedAt: timestamp('published_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.protocolId, table.versionNumber),
    unique().on(table.protocolId, table.versionHash),
  ],
);

// The GC pin set: the FK into sections makes sweeping a pinned section
// structurally impossible.
export const versionSections = pgTable(
  'version_sections',
  {
    versionId: uuid('version_id')
      .notNull()
      .references(() => protocolVersions.id),
    sectionId: text('section_id').notNull(),
    sectionHash: text('section_hash')
      .notNull()
      .references(() => sections.hash),
  },
  (table) => [primaryKey({ columns: [table.versionId, table.sectionId] })],
);

export const protocolDrafts = pgTable('protocol_drafts', {
  draftId: uuid('draft_id')
    .primaryKey()
    .references(() => drafts.id),
  protocolId: uuid('protocol_id')
    .notNull()
    .references(() => protocols.id),
  basedOnVersionId: uuid('based_on_version_id').references(
    () => protocolVersions.id,
  ),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Drizzle has no DDL surface for functions or triggers; applied after the
// tables, and hashed into the schema fingerprint — whitespace counts.
//
// CREATE OR REPLACE because DROP TABLE CASCADE leaves functions behind, and
// an `already exists` error thrown while applying reads as transient to the
// boot retry loop — which would spin forever instead of reporting a stale
// database.
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
`;
