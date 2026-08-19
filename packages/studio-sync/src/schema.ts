// Ships in the Studio server's production bundle: nothing beyond
// drizzle-orm/pg-core belongs in this module's import graph. Keep every
// definition schema-unqualified (no pgSchema()) — test isolation relies on
// unqualified DDL landing in the connection's search_path.
import { sql } from 'drizzle-orm';
import {
  bigint,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const drafts = pgTable('drafts', {
  id: uuid('id').primaryKey(),
  headSeq: bigint('head_seq', { mode: 'bigint' }).notNull().default(0n),
  headManifestHash: text('head_manifest_hash').notNull(),
});

// Immutable content-addressed section documents. clock_timestamp() rather
// than now(): expiry comparisons must be wall-clock, not transaction time.
export const sections = pgTable('sections', {
  hash: text('hash').primaryKey(),
  doc: jsonb('doc').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`clock_timestamp()`),
  unreferencedAt: timestamp('unreferenced_at', { withTimezone: true }),
});

// Manifests: ordered map of section id -> section hash, one row per commit.
// seq is the per-draft monotonic order; hash identifies (#1247: "hashes
// identify, sequences order").
export const manifests = pgTable(
  'manifests',
  {
    draftId: uuid('draft_id')
      .notNull()
      .references(() => drafts.id),
    seq: bigint('seq', { mode: 'bigint' }).notNull(),
    hash: text('hash').notNull(),
    parentHash: text('parent_hash'),
    sectionHashes: jsonb('section_hashes').notNull(),
  },
  (table) => [primaryKey({ columns: [table.draftId, table.seq] })],
);

// Lease table: owner is a connection/tab-scoped session id, never a user id.
// The draft reference is a real constraint: a lease for a draft that does not
// exist can only ever be dead weight.
export const leases = pgTable(
  'leases',
  {
    draftId: uuid('draft_id')
      .notNull()
      .references(() => drafts.id),
    sectionId: text('section_id').notNull(),
    owner: text('owner').notNull(),
    epoch: bigint('epoch', { mode: 'bigint' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.draftId, table.sectionId] })],
);

// Command log: the unique constraint delivers write-path idempotency.
// created_at bounds GC, which may prune a row only once retransmission is
// impossible. draft_id deliberately carries no foreign key: log rows must
// survive their draft.
export const commandLog = pgTable(
  'command_log',
  {
    id: bigint('id', { mode: 'bigint' })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    draftId: uuid('draft_id').notNull(),
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

// Drizzle has no DDL surface for functions or triggers; applied after the
// tables, and hashed into the schema fingerprint — whitespace counts.
export const SYNC_SIDECAR_SQL = `
CREATE OR REPLACE FUNCTION sections_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'section documents are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER sections_immutable
  BEFORE UPDATE ON sections
  FOR EACH ROW
  WHEN (NEW.hash IS DISTINCT FROM OLD.hash OR NEW.doc IS DISTINCT FROM OLD.doc)
  EXECUTE FUNCTION sections_are_immutable();
`;
