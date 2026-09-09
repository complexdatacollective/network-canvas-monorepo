// The protocol-builder host's durable storage (#1483): the event log a watcher
// replays from, and the receipts that make a retried write a replay too.
//
// `watchProtocol` hands out one ordered channel per open protocol and resumes
// from a cursor after a dropped connection, so every section revision and every
// lock change has to be replayable in the order it happened — which neither the
// manifest chain (it records no lock change) nor the command log (it records no
// order across sections) provides.
//
// `cursor` is per draft and allocated under the draft-head row lock every
// write already takes, so it is gapless and never commits out of order.
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
  uuid,
} from 'drizzle-orm/pg-core';

import {
  teamIsolationPolicies,
  tenantTablesSql,
} from '@codaco/studio-sync/rls';
import { drafts } from '@codaco/studio-sync/schema';

const protocolEvents = pgTable(
  'protocol_events',
  {
    draftId: uuid('draft_id').notNull(),
    teamId: text('team_id').notNull(),
    cursor: bigint('cursor', { mode: 'bigint' }).notNull(),
    kind: text('kind').notNull(),
    sectionId: text('section_id').notNull(),
    // Revision events: the manifest sequence this section reached, and the
    // document it reached. The document is stored rather than referenced by
    // hash because garbage collection sweeps unreferenced section rows, and a
    // replayed revision whose document had been swept would read as the
    // section having stopped existing.
    manifestSeq: bigint('manifest_seq', { mode: 'bigint' }),
    contentHash: text('content_hash'),
    doc: jsonb('doc'),
    // Lock events: the lease owner that took the section, and the presence
    // naming them. Both null when the section was released.
    owner: text('owner'),
    holder: jsonb('holder'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    primaryKey({ columns: [table.draftId, table.cursor] }),
    foreignKey({
      columns: [table.draftId, table.teamId],
      foreignColumns: [drafts.id, drafts.teamId],
    }),
    index('protocol_events_team_id_draft_id_cursor_idx').on(
      table.teamId,
      table.draftId,
      table.cursor,
    ),
    check(
      'protocol_events_kind_check',
      sql`${table.kind} IN ('revision', 'lock')`,
    ),
    check('protocol_events_cursor_check', sql`${table.cursor} > 0`),
    check(
      'protocol_events_section_id_check',
      sql`char_length(${table.sectionId}) BETWEEN 1 AND 512`,
    ),
    // A revision names the sequence and hash it landed at and no lease owner;
    // a lock names an owner and neither. A null `doc` on a revision is the
    // section having stopped existing at that revision.
    check(
      'protocol_events_shape_check',
      sql`CASE WHEN ${table.kind} = 'revision'
            THEN ${table.manifestSeq} IS NOT NULL
                 AND ${table.contentHash} IS NOT NULL
                 AND ${table.owner} IS NULL
                 AND ${table.holder} IS NULL
            ELSE ${table.manifestSeq} IS NULL
                 AND ${table.contentHash} IS NULL
                 AND ${table.doc} IS NULL
          END`,
    ),
    // A released section names no holder; a taken one names both.
    check(
      'protocol_events_holder_check',
      sql`(${table.owner} IS NULL) = (${table.holder} IS NULL)`,
    ),
    ...teamIsolationPolicies(),
  ],
);

/**
 * What one write already committed, for the retry that asks again.
 *
 * `submit` and `create` carry a `requestId` that is stable across an uncertain
 * retry, so a client whose answer was lost repeats the call with the same one
 * and is told what that attempt wrote. Persisted rather than remembered,
 * because the answer has to survive the process: a client that reconnects to a
 * restarted server is exactly the client whose answer went missing, and a
 * second create would leave the protocol holding the stage twice.
 *
 * Keyed by the draft the write was made in, its request id and the operation.
 * Not by the caller: a tab that reconnects without presenting the id it had is
 * a new owner, and refusing to recognise its retry is what turns a save that
 * succeeded into one the researcher is told to discard a draft over. The
 * operation is part of the key for the reason staging keeps the request's
 * kind — an id is promised to be stable across a retry of one intent, not to
 * be unique across the calls an editor makes.
 */
const protocolWriteReceipts = pgTable(
  'protocol_write_receipts',
  {
    draftId: uuid('draft_id').notNull(),
    teamId: text('team_id').notNull(),
    requestId: text('request_id').notNull(),
    operation: text('operation').notNull(),
    // The revision the write reached, as the contract reports it.
    revisionSeq: bigint('revision_seq', { mode: 'bigint' }).notNull(),
    revisionHash: text('revision_hash').notNull(),
    /** The section a `create` minted, so its retry names the one it made. */
    createdSectionId: text('created_section_id'),
    /** The resource descriptors the write promoted, as it answered with them. */
    promoted: jsonb('promoted'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    primaryKey({
      columns: [table.draftId, table.requestId, table.operation],
    }),
    foreignKey({
      columns: [table.draftId, table.teamId],
      foreignColumns: [drafts.id, drafts.teamId],
    }),
    check(
      'protocol_write_receipts_operation_check',
      sql`${table.operation} IN ('submit', 'create')`,
    ),
    check(
      'protocol_write_receipts_request_id_check',
      sql`char_length(${table.requestId}) BETWEEN 1 AND 512`,
    ),
    check(
      'protocol_write_receipts_revision_seq_check',
      sql`${table.revisionSeq} >= 0`,
    ),
    // A create names the section it made; a submit writes a section that was
    // already there and names none.
    check(
      'protocol_write_receipts_created_section_check',
      sql`CASE WHEN ${table.operation} = 'create'
            THEN ${table.createdSectionId} IS NOT NULL
            ELSE ${table.createdSectionId} IS NULL
          END`,
    ),
    ...teamIsolationPolicies(),
  ],
);

export const PROTOCOL_BUILDER_TABLES = {
  protocolEvents,
  protocolWriteReceipts,
};

// Hashed into the schema fingerprint — whitespace counts.
export const PROTOCOL_BUILDER_SIDECAR_SQL = `
${tenantTablesSql(['protocol_events', 'protocol_write_receipts'])}
`;
