import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { teamIsolationPolicy, tenantTablesSql } from '@codaco/studio-sync/rls';

import { PROTOCOL_TABLES } from '../protocol/schema.ts';
import { ERASURE_GUC, STUDY_TABLES } from '../study/schema.ts';

const { protocolVersions } = PROTOCOL_TABLES;
const { interviewSessions, participants, studyWaves } = STUDY_TABLES;

// The collected-data module: the graph, its frozen snapshot, and the
// projections aggregates read. ADR #1246 makes `src/network/` the only
// directory permitted to touch these tables; `network/__tests__/boundary.test.ts`
// is that rule's enforcement.
//
// The module imports STUDY_TABLES and PROTOCOL_TABLES for its foreign-key
// targets — a read across the boundary, which the ADR's rule permits: the rule
// forbids other code touching network tables, not the network layer
// referencing its parents.
//
// Declaration order is forced by drizzle evaluating `foreignColumns` eagerly:
//   session_snapshots -> nodes -> edges -> session_stats
//   -> session_degree_hist
// (`edges` references `nodes`.)

// The immutable, as-collected interview payload for one finalized session: the
// document view that provenance and export read, beside the row-shaped
// queryable view that aggregates read.
//
// Its own table rather than a nullable column on `interview_sessions`, because
// "immutable artifact" is already a table with an always-raise trigger three
// times over (`protocol_versions`, `version_sections`, `audit_events`), and
// because the separate table buys the stronger invariant borrowed from
// `version_sections_insert_frozen`: a snapshot may be inserted only in the
// transaction that finalizes its session, so the document view and the
// queryable view cannot diverge even by one commit.
const sessionSnapshots = pgTable(
  'session_snapshots',
  {
    sessionId: uuid('session_id').primaryKey(),
    teamId: text('team_id').notNull(),
    studyId: uuid('study_id').notNull(),
    protocolVersionId: uuid('protocol_version_id').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    payload: jsonb('payload').notNull(),
    payloadHash: text('payload_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.sessionId, table.studyId, table.teamId],
      foreignColumns: [
        interviewSessions.id,
        interviewSessions.studyId,
        interviewSessions.teamId,
      ],
    }),
    // A frozen artifact that cannot say which schema and which protocol
    // version produced it is not usable as provenance.
    foreignKey({
      columns: [table.protocolVersionId, table.teamId],
      foreignColumns: [protocolVersions.id, protocolVersions.teamId],
    }),
    index('session_snapshots_team_id_study_id_idx').on(
      table.teamId,
      table.studyId,
    ),
    check(
      'session_snapshots_payload_check',
      sql`jsonb_typeof(${table.payload}) = 'object'
          AND ${table.schemaVersion} > 0
          AND char_length(${table.payloadHash}) BETWEEN 1 AND 128`,
    ),
    teamIsolationPolicy(),
  ],
);

// The live, mutable interview network as typed rows — the explicit anti-blob
// commitment. One row per network entity per session, with the
// researcher-defined variables in a JSONB attribute bag.
//
// `node_id` is the network-local entity id — `NcNode['_uid']` — minted by the
// interview client and unique inside its session. It is not a database row id
// and not a protocol-side codebook id; `type` is the codebook node type id.
// There is no separate row uuid: the primary key is `(session_id, node_id)`,
// which is what lets `edges.from_node` and `edges.to_node` refer to a node
// without a lookup.
//
// The column is `text`, not `uuid`, and this is not a preference.
// Roster-sourced nodes mint their `_uid` as
// `${subjectType}_${hash({node, index})}`
// (packages/interview/src/utils/loadExternalData.ts) and `NcNode['_uid']` is
// `z.string()` in packages/shared-consts/src/network.ts. A `uuid` column would
// reject every roster-sourced node and push a lossy normalization into the
// import path.
const nodes = pgTable(
  'nodes',
  {
    teamId: text('team_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    nodeId: text('node_id').notNull(),
    // The codebook node type id.
    type: text('type').notNull(),
    attributes: jsonb('attributes')
      .notNull()
      .default(sql`'{}'::jsonb`),
    // NcEntity['_secureAttributes']: per-variable {iv, salt} for
    // client-encrypted variable values. Must round-trip or an encrypted
    // interview cannot be stored.
    secureAttributes: jsonb('secure_attributes'),
    // NcNode.stageId / NcNode.promptIDs: which stage and prompts created this
    // node. stage_id is a column, not a JSON key, because the monitoring
    // dashboard's abandoned-at-stage and per-stage signals group by it.
    stageId: text('stage_id'),
    promptIds: text('prompt_ids').array(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.nodeId] }),
    // No cascade, deliberately: study data must never disappear as a side
    // effect of a parent row going away. The bottom-up delete order in the
    // sidecar comment is what both destructive paths follow instead.
    foreignKey({
      columns: [table.sessionId, table.teamId],
      foreignColumns: [interviewSessions.id, interviewSessions.teamId],
    }),
    index('nodes_team_id_session_id_idx').on(table.teamId, table.sessionId),
    index('nodes_team_id_session_id_type_idx').on(
      table.teamId,
      table.sessionId,
      table.type,
    ),
    // The audit_events_identifier_lengths_check convention: an unbounded text
    // key on the largest table is an index-bloat vector.
    check(
      'nodes_identifier_lengths_check',
      sql`char_length(${table.nodeId}) BETWEEN 1 AND 128
          AND char_length(${table.type}) BETWEEN 1 AND 128
          AND (${table.stageId} IS NULL
               OR char_length(${table.stageId}) BETWEEN 1 AND 128)`,
    ),
    check(
      'nodes_attributes_object_check',
      sql`jsonb_typeof(${table.attributes}) = 'object'
          AND (${table.secureAttributes} IS NULL
               OR jsonb_typeof(${table.secureAttributes}) = 'object')`,
    ),
    // No GIN index on `attributes`: nothing filters on them yet, and an unused
    // GIN index on millions of rows is pure write cost. Add one per hot
    // attribute as an expression index inside this module when filtering
    // demands it.
    teamIsolationPolicy(),
  ],
);

// The alter-alter ties of a session's network, as typed rows with referential
// integrity to their endpoints.
const edges = pgTable(
  'edges',
  {
    teamId: text('team_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    edgeId: text('edge_id').notNull(),
    type: text('type').notNull(),
    fromNode: text('from_node').notNull(),
    toNode: text('to_node').notNull(),
    attributes: jsonb('attributes')
      .notNull()
      .default(sql`'{}'::jsonb`),
    secureAttributes: jsonb('secure_attributes'),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.edgeId] }),
    foreignKey({
      columns: [table.sessionId, table.teamId],
      foreignColumns: [interviewSessions.id, interviewSessions.teamId],
    }),
    // An edge to a node that does not exist is corruption the "rows, not a
    // blob" thesis exists to make impossible. Both endpoints are proven, and
    // deleting a node therefore requires deleting its incident edges first —
    // which is what the runtime already does.
    foreignKey({
      columns: [table.sessionId, table.fromNode],
      foreignColumns: [nodes.sessionId, nodes.nodeId],
    }),
    foreignKey({
      columns: [table.sessionId, table.toNode],
      foreignColumns: [nodes.sessionId, nodes.nodeId],
    }),
    // Alter-alter tie counts by type.
    index('edges_team_id_session_id_type_idx').on(
      table.teamId,
      table.sessionId,
      table.type,
    ),
    // The ADR's covering index, expressed as a key index: drizzle
    // 1.0.0-rc.4 has no `.include()`, and an index created in the sidecar
    // would be dropped by the next drizzle-kit push (breaking apply-schema's
    // no-op property). Index-only scans for the degree formulation are
    // unaffected; the index is larger because the endpoints ride in the key
    // rather than the leaf payload.
    index('edges_team_id_session_id_endpoints_idx').on(
      table.teamId,
      table.sessionId,
      table.fromNode,
      table.toNode,
    ),
    check(
      'edges_identifier_lengths_check',
      sql`char_length(${table.edgeId}) BETWEEN 1 AND 128
          AND char_length(${table.type}) BETWEEN 1 AND 128
          AND char_length(${table.fromNode}) BETWEEN 1 AND 128
          AND char_length(${table.toNode}) BETWEEN 1 AND 128`,
    ),
    check(
      'edges_attributes_object_check',
      sql`jsonb_typeof(${table.attributes}) = 'object'
          AND (${table.secureAttributes} IS NULL
               OR jsonb_typeof(${table.secureAttributes}) = 'object')`,
    ),
    // No `from_node <> to_node` check: no Network Canvas stage type creates a
    // self-loop today, but nothing in the protocol schema forbids one, and a
    // CHECK here would be a validation rule in the wrong layer.
    teamIsolationPolicy(),
  ],
);

// The in-transaction per-session projections the ADR's acceptance gate was
// decided on: degree distribution and wave-over-wave comparison are served
// from these two tables, with raw-row queries as the flexible fallback.
//
// Maintained by application code — `projections.ts` — rather than by a
// trigger. A row-level trigger would fire once per node and edge rather than
// once per commit; a statement-level one would recompute twice for a delta
// that touches nodes and edges in separate statements; and this codebase's
// triggers carry promises that must survive application bugs, which a stale
// rollup is not.
const sessionStats = pgTable(
  'session_stats',
  {
    teamId: text('team_id').notNull(),
    sessionId: uuid('session_id').primaryKey(),
    studyId: uuid('study_id').notNull(),
    waveId: uuid('wave_id').notNull(),
    // The ordinal the wave-over-wave window function orders by. wave_id is
    // identity; wave_number is order. Both are needed.
    waveNumber: integer('wave_number').notNull(),
    // Nullable: anonymous sessions have no participant.
    participantId: uuid('participant_id'),
    nodeCount: integer('node_count').notNull(),
    edgeCount: integer('edge_count').notNull(),
    // A projection that cannot say when it was computed cannot be audited
    // after an erasure recompute.
    computedAt: timestamp('computed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The denormalized copies are proven by the composite uniques their
    // parents already carry; only wave_number is an unproven copy, and it is
    // immutable at the source (study_waves_identity_immutable).
    foreignKey({
      columns: [table.sessionId, table.studyId, table.teamId],
      foreignColumns: [
        interviewSessions.id,
        interviewSessions.studyId,
        interviewSessions.teamId,
      ],
    }),
    foreignKey({
      columns: [table.waveId, table.studyId, table.teamId],
      foreignColumns: [studyWaves.id, studyWaves.studyId, studyWaves.teamId],
    }),
    foreignKey({
      columns: [table.participantId, table.studyId, table.teamId],
      foreignColumns: [
        participants.id,
        participants.studyId,
        participants.teamId,
      ],
    }),
    index('session_stats_team_id_study_id_wave_number_idx').on(
      table.teamId,
      table.studyId,
      table.waveNumber,
    ),
    // Wave-over-wave partitions by participant and orders by wave number
    // across the whole study.
    index('session_stats_team_id_study_id_participant_id_wave_number_idx').on(
      table.teamId,
      table.studyId,
      table.participantId,
      table.waveNumber,
    ),
    check(
      'session_stats_counts_check',
      sql`${table.nodeCount} >= 0 AND ${table.edgeCount} >= 0
          AND ${table.waveNumber} >= 1`,
    ),
    teamIsolationPolicy(),
  ],
);

// The per-session degree distribution: one row per degree actually observed,
// carrying how many of the session's nodes hold it.
const sessionDegreeHist = pgTable(
  'session_degree_hist',
  {
    teamId: text('team_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    degree: integer('degree').notNull(),
    nodeCount: integer('node_count').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.degree] }),
    foreignKey({
      columns: [table.sessionId, table.teamId],
      foreignColumns: [interviewSessions.id, interviewSessions.teamId],
    }),
    index('session_degree_hist_team_id_session_id_idx').on(
      table.teamId,
      table.sessionId,
    ),
    check(
      'session_degree_hist_counts_check',
      sql`${table.degree} >= 0 AND ${table.nodeCount} > 0`,
    ),
    teamIsolationPolicy(),
  ],
);

export const NETWORK_TABLES = {
  sessionSnapshots,
  nodes,
  edges,
  sessionStats,
  sessionDegreeHist,
};

// Hashed into the schema fingerprint — whitespace counts. CREATE OR REPLACE
// because DROP TABLE CASCADE leaves functions behind, and an `already exists`
// error reads as transient to the boot retry loop.
//
// Bottom-up delete order — the FK graph is shaped so both destructive paths
// are a simple ordered sequence with no cascade anywhere:
//
//   participant erasure (app role, ERASURE_GUC set to the participant id):
//     session_degree_hist -> session_stats -> edges -> nodes
//     -> session_snapshots -> interview_sessions -> interview_links
//     -> participants
//
//   study purge (studio_maintenance):
//     ... the same eight, for every session of the study ...
//     -> study_waves -> studies
//
// Neither path touches `audit_events`; the database refuses it regardless.
export const NETWORK_SIDECAR_SQL = `
-- A snapshot may only be written in the transaction that finalizes its
-- session, the version_sections_insert_frozen pattern: the document view and
-- the queryable view can never diverge, not even by one commit.
CREATE OR REPLACE FUNCTION session_snapshots_insert_at_finalization() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM interview_sessions s
    WHERE s.id = NEW.session_id
      AND s.team_id = NEW.team_id
      AND s.status = 'completed'
      AND s.xmin = pg_current_xact_id()::xid
  ) THEN
    RAISE EXCEPTION 'a session snapshot may only be written in the transaction that finalizes its session';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER session_snapshots_insert_frozen
  BEFORE INSERT ON session_snapshots
  FOR EACH ROW EXECUTE FUNCTION session_snapshots_insert_at_finalization();

-- UPDATE always raises. DELETE stays possible, because both the maintenance
-- purge and the participant-erasure command legitimately delete a finalized
-- session's snapshot, each through its own audited path.
CREATE OR REPLACE FUNCTION session_snapshots_are_immutable() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('${ERASURE_GUC}', true), '');
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'session snapshots are immutable';
  END IF;
  IF current_user = 'studio_maintenance' THEN
    RETURN OLD;
  END IF;
  IF marker IS NOT NULL AND EXISTS (
    SELECT 1 FROM interview_sessions s
    WHERE s.id = OLD.session_id AND s.team_id = OLD.team_id
      AND s.participant_id::text = marker
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'session snapshots are deleted only by an audited erasure or the maintenance purge';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER session_snapshots_immutable
  BEFORE UPDATE OR DELETE ON session_snapshots
  FOR EACH ROW EXECUTE FUNCTION session_snapshots_are_immutable();

-- \`nodes\`, \`edges\`, \`session_stats\` and \`session_degree_hist\` all need the
-- same promise: no writes when the owning session is finalized or the owning
-- study is closed, except the purge's and the marked erasure's deletes. A
-- row-level trigger would pay two index probes on every one of millions of
-- rows; a statement-level AFTER trigger with a transition table pays one join
-- per statement, whatever the row count — and because these tables share the
-- \`(team_id, session_id)\` shape, one function serves all four. \`changed\` is
-- the transition table every trigger registers under the same name, so the
-- query is static.
--
-- The finalization test excludes sessions finalized in THIS transaction
-- (s.xmin = pg_current_xact_id()): the finalizing transaction legitimately
-- recomputes rollups and writes the snapshot after flipping status.
--
-- The guard is deliberately NOT SECURITY DEFINER. A definer function would
-- need a pinned search_path, which breaks the scratch-schema isolation the
-- suites rely on. The fail-open it would otherwise close — a \`changed\` row
-- whose parent is invisible under RLS — is already closed upstream: the row's
-- own WITH CHECK policy rejects a team_id that does not match the
-- transaction's context before this AFTER trigger runs, and the composite FK
-- rejects a session that does not exist.
CREATE OR REPLACE FUNCTION network_rows_parent_is_writable() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('${ERASURE_GUC}', true), '');
  offender uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user = 'studio_maintenance' THEN
      RETURN NULL;
    END IF;
    IF marker IS NOT NULL THEN
      -- The marker authorizes exactly one participant's data.
      SELECT c.session_id INTO offender
      FROM changed c
      JOIN interview_sessions s
        ON s.id = c.session_id AND s.team_id = c.team_id
      WHERE s.participant_id IS NULL OR s.participant_id::text <> marker
      LIMIT 1;
      IF offender IS NOT NULL THEN
        RAISE EXCEPTION 'participant erasure may only delete the marked participant''s network data (session %)', offender;
      END IF;
      RETURN NULL;
    END IF;
    -- An unmarked application-role delete is an ordinary edit of a live
    -- interview: the runtime removes a node and its edges whenever a
    -- participant changes their mind, and the projection refresh rewrites
    -- session_degree_hist on every call. It is therefore governed by the
    -- parent-writable rule below exactly like an insert or an update — refused
    -- once the session is finalized or the study closed, where only the marked
    -- erasure and the maintenance purge above may delete.
  END IF;

  SELECT c.session_id INTO offender
  FROM changed c
  JOIN interview_sessions s
    ON s.id = c.session_id AND s.team_id = c.team_id
  JOIN studies st
    ON st.id = s.study_id AND st.team_id = s.team_id
  WHERE (s.status = 'completed' AND s.xmin <> pg_current_xact_id()::xid)
     OR st.state = 'closed'
  LIMIT 1;
  IF offender IS NOT NULL THEN
    RAISE EXCEPTION 'network data for a finalized session or a closed study is read-only (session %)', offender;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- A trigger may declare only one transition-table clause per event, so each
-- guarded table takes three, one per verb.
CREATE OR REPLACE TRIGGER nodes_parent_writable_insert
  AFTER INSERT ON nodes REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();
CREATE OR REPLACE TRIGGER nodes_parent_writable_update
  AFTER UPDATE ON nodes REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();
CREATE OR REPLACE TRIGGER nodes_parent_writable_delete
  AFTER DELETE ON nodes REFERENCING OLD TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();

CREATE OR REPLACE TRIGGER edges_parent_writable_insert
  AFTER INSERT ON edges REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();
CREATE OR REPLACE TRIGGER edges_parent_writable_update
  AFTER UPDATE ON edges REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();
CREATE OR REPLACE TRIGGER edges_parent_writable_delete
  AFTER DELETE ON edges REFERENCING OLD TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();

CREATE OR REPLACE TRIGGER session_stats_parent_writable_insert
  AFTER INSERT ON session_stats REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();
CREATE OR REPLACE TRIGGER session_stats_parent_writable_update
  AFTER UPDATE ON session_stats REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();
CREATE OR REPLACE TRIGGER session_stats_parent_writable_delete
  AFTER DELETE ON session_stats REFERENCING OLD TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();

CREATE OR REPLACE TRIGGER session_degree_hist_parent_writable_insert
  AFTER INSERT ON session_degree_hist REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();
CREATE OR REPLACE TRIGGER session_degree_hist_parent_writable_update
  AFTER UPDATE ON session_degree_hist REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();
CREATE OR REPLACE TRIGGER session_degree_hist_parent_writable_delete
  AFTER DELETE ON session_degree_hist REFERENCING OLD TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION network_rows_parent_is_writable();

-- Session reassignment is caught without a probe, so it stays row-level.
CREATE OR REPLACE FUNCTION network_row_session_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'a network row cannot change session or team';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER nodes_session_immutable
  BEFORE UPDATE ON nodes FOR EACH ROW
  WHEN (NEW.session_id IS DISTINCT FROM OLD.session_id
        OR NEW.team_id IS DISTINCT FROM OLD.team_id)
  EXECUTE FUNCTION network_row_session_is_immutable();

CREATE OR REPLACE TRIGGER edges_session_immutable
  BEFORE UPDATE ON edges FOR EACH ROW
  WHEN (NEW.session_id IS DISTINCT FROM OLD.session_id
        OR NEW.team_id IS DISTINCT FROM OLD.team_id)
  EXECUTE FUNCTION network_row_session_is_immutable();

CREATE OR REPLACE TRIGGER session_stats_session_immutable
  BEFORE UPDATE ON session_stats FOR EACH ROW
  WHEN (NEW.session_id IS DISTINCT FROM OLD.session_id
        OR NEW.team_id IS DISTINCT FROM OLD.team_id)
  EXECUTE FUNCTION network_row_session_is_immutable();

CREATE OR REPLACE TRIGGER session_degree_hist_session_immutable
  BEFORE UPDATE ON session_degree_hist FOR EACH ROW
  WHEN (NEW.session_id IS DISTINCT FROM OLD.session_id
        OR NEW.team_id IS DISTINCT FROM OLD.team_id)
  EXECUTE FUNCTION network_row_session_is_immutable();
${tenantTablesSql([
  'session_snapshots',
  'nodes',
  'edges',
  'session_stats',
  'session_degree_hist',
])}
`;
