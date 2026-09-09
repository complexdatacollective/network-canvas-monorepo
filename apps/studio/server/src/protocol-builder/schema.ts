// The protocol-builder host's event log (#1483). `watchProtocol` hands out one
// ordered channel per open protocol and resumes from a cursor after a dropped
// connection, so every section revision and every lock change has to be
// replayable in the order it happened — which neither the manifest chain (it
// records no lock change) nor the command log (it records no order across
// sections) provides.
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

export const PROTOCOL_EVENT_TABLES = { protocolEvents };

// Hashed into the schema fingerprint — whitespace counts.
export const PROTOCOL_EVENT_SIDECAR_SQL = `
${tenantTablesSql(['protocol_events'])}
`;
