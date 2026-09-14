// Templates and the gallery (#1282–#1285). #1282's design review settles the
// model: a template *is* a section document — or a small manifest of sections —
// plus its metadata row (#1283). The content therefore reuses the existing
// content-addressed store, and these three tables are the metadata row, the
// manifest, and the pin set, deliberately mirroring `protocol_versions` /
// `version_sections`.
//
// `template_registry_publications` is deliberately absent: the outbound record
// of a publication to the central registry waits until #1284 defines the
// exchange format (decided 2026-09-03).
import { sql } from 'drizzle-orm';
import {
  boolean,
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
import { sections } from '@codaco/studio-sync/schema';

const templates = pgTable(
  'templates',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    summary: text('summary'),
    license: text('license').notNull().default('CC-BY-4.0'),
    // The team-endorsed tier. Granted by review, never self-set: the reviewer
    // is a platform operator outside the tenant, so this is enforced at the
    // command layer rather than in the schema.
    curated: boolean('curated').notNull().default(false),
    state: text('state').notNull().default('draft'),
    // #1283's citation and provenance layer: authors, DOIs, validating
    // papers, keywords. Zod-validated at write, queried by the gallery.
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    authorUserId: text('author_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    index('templates_team_id_kind_idx').on(table.teamId, table.kind),
    index('templates_team_id_curated_idx')
      .on(table.teamId, table.curated)
      .where(sql`curated`),
    check(
      'templates_kind_check',
      sql`${table.kind} IN ('protocol', 'stage', 'entity_definition', 'variable_set', 'generator_prompt_set')`,
    ),
    check(
      'templates_license_check',
      sql`${table.license} IN ('CC-BY-4.0', 'CC0-1.0')`,
    ),
    check(
      'templates_state_check',
      sql`${table.state} IN ('draft', 'published', 'retired')`,
    ),
    check(
      'templates_metadata_object_check',
      sql`jsonb_typeof(${table.metadata}) = 'object'`,
    ),
    check(
      'templates_lengths_check',
      sql`char_length(${table.name}) BETWEEN 1 AND 200
          AND ${table.name} ~ '[^[:space:]]'
          AND (${table.summary} IS NULL OR char_length(${table.summary}) BETWEEN 1 AND 2000)
          AND (${table.authorUserId} IS NULL OR char_length(${table.authorUserId}) BETWEEN 1 AND 255)`,
    ),
    teamIsolationPolicy(),
  ],
);

const templateVersions = pgTable(
  'template_versions',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    templateId: uuid('template_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    // Ordered map of section id -> section hash, exactly protocol_versions'
    // manifest shape.
    manifest: jsonb('manifest').notNull(),
    manifestHash: text('manifest_hash').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    unique().on(table.templateId, table.versionNumber),
    unique().on(table.templateId, table.manifestHash),
    foreignKey({
      name: 'template_versions_template_fk',
      columns: [table.templateId, table.teamId],
      foreignColumns: [templates.id, templates.teamId],
    }),
    check(
      'template_versions_numbers_check',
      sql`${table.versionNumber} >= 1 AND ${table.schemaVersion} >= 1`,
    ),
    check(
      'template_versions_manifest_hash_check',
      sql`${table.manifestHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'template_versions_manifest_object_check',
      sql`jsonb_typeof(${table.manifest}) = 'object'`,
    ),
    teamIsolationPolicy(),
  ],
);

// The GC pin set, identical in role to version_sections: the FK into sections
// makes sweeping a template's content structurally impossible.
const templateVersionSections = pgTable(
  'template_version_sections',
  {
    versionId: uuid('version_id').notNull(),
    teamId: text('team_id').notNull(),
    sectionId: text('section_id').notNull(),
    sectionHash: text('section_hash').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.versionId, table.sectionId] }),
    foreignKey({
      name: 'template_version_sections_version_fk',
      columns: [table.versionId, table.teamId],
      foreignColumns: [templateVersions.id, templateVersions.teamId],
    }),
    foreignKey({
      name: 'template_version_sections_section_fk',
      columns: [table.teamId, table.sectionHash],
      foreignColumns: [sections.teamId, sections.hash],
    }),
    index('template_version_sections_team_id_section_hash_idx').on(
      table.teamId,
      table.sectionHash,
    ),
    teamIsolationPolicy(),
  ],
);

export const TEMPLATE_TABLES = {
  templates,
  templateVersions,
  templateVersionSections,
};

// Hashed into the schema fingerprint — whitespace counts. CREATE OR REPLACE
// because DROP TABLE CASCADE leaves functions behind, and an `already exists`
// error reads as transient to the boot retry loop.
export const TEMPLATE_SIDECAR_SQL = `
CREATE OR REPLACE FUNCTION template_versions_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'published template versions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER template_versions_immutable
  BEFORE UPDATE OR DELETE ON template_versions
  FOR EACH ROW EXECUTE FUNCTION template_versions_are_immutable();

CREATE OR REPLACE TRIGGER template_version_sections_immutable
  BEFORE UPDATE OR DELETE ON template_version_sections
  FOR EACH ROW EXECUTE FUNCTION template_versions_are_immutable();

-- Adding a pin after publication would change what the version resolves to
-- while its frozen manifest and hash stayed unchanged (version_sections).
CREATE OR REPLACE FUNCTION template_version_sections_pins_are_frozen() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM template_versions v
    WHERE v.id = NEW.version_id AND v.xmin = pg_current_xact_id()::xid
  ) THEN
    RAISE EXCEPTION 'published template versions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER template_version_sections_insert_frozen
  BEFORE INSERT ON template_version_sections
  FOR EACH ROW EXECUTE FUNCTION template_version_sections_pins_are_frozen();
${tenantTablesSql([
  'templates',
  'template_versions',
  'template_version_sections',
])}
`;
