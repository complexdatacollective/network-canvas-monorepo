// Ships in the server's production bundle: import nothing beyond
// drizzle-orm/pg-core. No pgSchema() — scratch-schema test isolation relies
// on unqualified DDL.
import { sql } from 'drizzle-orm';
import {
  bigint,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// team_id carries no foreign key: this package cannot import the app-owned
// teams table. Children pin the denormalized column through composite foreign
// keys into drafts instead.
export const drafts = pgTable(
  'drafts',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    headSeq: bigint('head_seq', { mode: 'bigint' }).notNull().default(0n),
    headManifestHash: text('head_manifest_hash').notNull(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    index('drafts_team_id_idx').on(table.teamId),
  ],
);

// Immutable content-addressed section documents, deduplicated per team —
// a shared row would leak content across the tenant boundary.
// clock_timestamp() rather than now(): expiry comparisons must be wall-clock,
// not transaction time.
export const sections = pgTable(
  'sections',
  {
    teamId: text('team_id').notNull(),
    hash: text('hash').notNull(),
    doc: jsonb('doc').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    unreferencedAt: timestamp('unreferenced_at', { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.hash] })],
);

// Manifests: ordered map of section id -> section hash, one row per commit.
// seq is the per-draft monotonic order; hash identifies (#1247: "hashes
// identify, sequences order").
const manifests = pgTable(
  'manifests',
  {
    draftId: uuid('draft_id').notNull(),
    teamId: text('team_id').notNull(),
    seq: bigint('seq', { mode: 'bigint' }).notNull(),
    hash: text('hash').notNull(),
    parentHash: text('parent_hash'),
    sectionHashes: jsonb('section_hashes').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.draftId, table.seq] }),
    foreignKey({
      columns: [table.draftId, table.teamId],
      foreignColumns: [drafts.id, drafts.teamId],
    }),
    index('manifests_team_id_idx').on(table.teamId),
  ],
);

// Lease table: owner is a connection/tab-scoped session id, never a user id.
// The draft reference is a real constraint: a lease for a draft that does not
// exist can only ever be dead weight.
const leases = pgTable(
  'leases',
  {
    draftId: uuid('draft_id').notNull(),
    teamId: text('team_id').notNull(),
    sectionId: text('section_id').notNull(),
    owner: text('owner').notNull(),
    epoch: bigint('epoch', { mode: 'bigint' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.draftId, table.sectionId] }),
    foreignKey({
      columns: [table.draftId, table.teamId],
      foreignColumns: [drafts.id, drafts.teamId],
    }),
  ],
);

// Command log: the unique constraint delivers write-path idempotency.
// created_at bounds GC, which may prune a row only once retransmission is
// impossible. draft_id deliberately carries no foreign key: log rows must
// survive their draft.
const commandLog = pgTable(
  'command_log',
  {
    id: bigint('id', { mode: 'bigint' })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    draftId: uuid('draft_id').notNull(),
    teamId: text('team_id').notNull(),
    sectionId: text('section_id').notNull(),
    owner: text('owner').notNull(),
    epoch: bigint('epoch', { mode: 'bigint' }).notNull(),
    clientSeq: bigint('client_seq', { mode: 'bigint' }).notNull(),
    commands: jsonb('commands').notNull(),
    manifestSeq: bigint('manifest_seq', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique().on(
      table.draftId,
      table.sectionId,
      table.owner,
      table.epoch,
      table.clientSeq,
    ),
  ],
);

export const SYNC_TABLES = {
  drafts,
  sections,
  manifests,
  leases,
  commandLog,
};

// Hashed into the schema fingerprint — whitespace counts.
export const SYNC_SIDECAR_SQL = `
CREATE OR REPLACE FUNCTION sections_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'section documents are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER sections_immutable
  BEFORE UPDATE ON sections
  FOR EACH ROW
  WHEN (NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.hash IS DISTINCT FROM OLD.hash OR NEW.doc IS DISTINCT FROM OLD.doc)
  EXECUTE FUNCTION sections_are_immutable();
`;
