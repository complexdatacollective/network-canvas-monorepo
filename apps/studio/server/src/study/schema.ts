import { sql } from 'drizzle-orm';
import {
  bigint,
  bytea,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { teamIsolationPolicy, tenantTablesSql } from '@codaco/studio-sync/rls';

import { teams } from '../db/auth-schema.ts';
import { PROTOCOL_TABLES } from '../protocol/schema.ts';

const { protocols, protocolVersions } = PROTOCOL_TABLES;

/**
 * The transaction-scoped marker an audited participant-erasure command sets
 * (`SET LOCAL app.erasing_participant_id = '<uuid>'`) so the database can tell
 * a legitimate erasure delete from a buggy application-role delete. Erasure
 * runs as `studio_app`, the same role as any bug, so `current_user` cannot
 * distinguish them. The guards additionally prove the marker against the row's
 * owning participant, so the marker authorizes deleting exactly one
 * participant's data, never anything else.
 */
export const ERASURE_GUC = 'app.erasing_participant_id';

/** Domain cap on waves per study, enforced in commands. */
export const MAX_WAVES_PER_STUDY = 50;

// `protocol/schema.ts` does not export its tables individually, so the study
// module destructures PROTOCOL_TABLES. Declaration order in this file is
// forced by drizzle evaluating `foreignColumns` eagerly:
//   studies -> study_waves -> participants -> interview_links
//   -> interview_sessions
// (`interview_sessions` references all four; `interview_links` references only
// waves and participants, so there is no cycle.)

// The team-scoped record that ties a protocol line to a set of waves, delivery
// settings, participants, and collected sessions.
const studies = pgTable(
  'studies',
  {
    id: uuid('id').primaryKey(),
    // No cascade, deliberately: team deletion is refused outright
    // (disableOrganizationDeletion), and study data must never disappear as a
    // side effect of a parent row going away. The `protocols` FK sets the
    // precedent.
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id),
    name: text('name').notNull(),
    state: text('state').notNull().default('draft'),
    participationMode: text('participation_mode').notNull().default('managed'),
    waveProgression: text('wave_progression').notNull().default('window'),
    pauseGraceMinutes: integer('pause_grace_minutes').notNull().default(60),
    // Nullable while Draft; a Draft retarget clears every wave pin.
    protocolId: uuid('protocol_id'),
    settings: jsonb('settings')
      .notNull()
      .default(sql`'{}'::jsonb`),
    deletionRequestedAt: timestamp('deletion_requested_at', {
      withTimezone: true,
    }),
    purgeAfter: timestamp('purge_after', { withTimezone: true }),
    // The FIRST go-live, never cleared: the participation-mode freeze evidence.
    wentLiveAt: timestamp('went_live_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    foreignKey({
      columns: [table.protocolId, table.teamId],
      foreignColumns: [protocols.id, protocols.teamId],
    }),
    // Team-first and ordered: serves RLS-composed lookups, `studies.list`'s
    // cursor pagination (newest first) and the app shell's study chip in one
    // index. Subsumes the bare team_id index `protocols` carries.
    index('studies_team_id_created_at_id_idx').on(
      table.teamId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    // The domain's only cross-team query: the maintenance purge scan. The
    // team-first index cannot serve it.
    index('studies_purge_after_idx')
      .on(table.purgeAfter)
      .where(sql`${table.deletionRequestedAt} IS NOT NULL`),
    check(
      'studies_name_nonblank_check',
      sql`${table.name} ~ '[^[:space:]]' AND char_length(${table.name}) <= 320`,
    ),
    check(
      'studies_state_check',
      sql`${table.state} IN ('draft', 'live', 'paused', 'closed')`,
    ),
    check(
      'studies_participation_mode_check',
      sql`${table.participationMode} IN ('managed', 'anonymous')`,
    ),
    check(
      'studies_wave_progression_check',
      sql`${table.waveProgression} IN ('window', 'sequential')`,
    ),
    check(
      'studies_pause_grace_minutes_check',
      sql`${table.pauseGraceMinutes} >= 0 AND ${table.pauseGraceMinutes} <= 43200`,
    ),
    check(
      'studies_settings_object_check',
      sql`jsonb_typeof(${table.settings}) = 'object'`,
    ),
    check(
      'studies_deletion_marker_check',
      sql`(${table.deletionRequestedAt} IS NULL) = (${table.purgeAfter} IS NULL)`,
    ),
    // A live study never carries a close timestamp; a closed one always does.
    check(
      'studies_closed_at_check',
      sql`(${table.state} = 'closed') = (${table.closedAt} IS NOT NULL)`,
    ),
    check(
      'studies_paused_at_check',
      sql`(${table.state} = 'paused') = (${table.pausedAt} IS NOT NULL)`,
    ),
    teamIsolationPolicy(),
  ],
);

// A study's timepoints. Each wave pins one published protocol version, carries
// its optional window, and is the target every interview link and every
// session names.
const studyWaves = pgTable(
  'study_waves',
  {
    id: uuid('id').primaryKey(),
    studyId: uuid('study_id').notNull(),
    teamId: text('team_id').notNull(),
    waveNumber: integer('wave_number').notNull(),
    name: text('name'),
    // Nullable until go-live; every pin must belong to the study's own
    // protocol line, validated in the command layer.
    protocolVersionId: uuid('protocol_version_id'),
    opensAt: timestamp('opens_at', { withTimezone: true }),
    closesAt: timestamp('closes_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    // The same-study proof sessions and links composite-FK through.
    unique().on(table.id, table.studyId, table.teamId),
    unique().on(table.studyId, table.waveNumber),
    foreignKey({
      columns: [table.studyId, table.teamId],
      foreignColumns: [studies.id, studies.teamId],
    }),
    foreignKey({
      columns: [table.protocolVersionId, table.teamId],
      foreignColumns: [protocolVersions.id, protocolVersions.teamId],
    }),
    index('study_waves_team_id_study_id_wave_number_idx').on(
      table.teamId,
      table.studyId,
      table.waveNumber,
    ),
    check('study_waves_wave_number_check', sql`${table.waveNumber} >= 1`),
    check(
      'study_waves_name_check',
      sql`${table.name} IS NULL
          OR (${table.name} ~ '[^[:space:]]' AND char_length(${table.name}) <= 320)`,
    ),
    check(
      'study_waves_window_check',
      sql`${table.opensAt} IS NULL
          OR ${table.closesAt} IS NULL
          OR ${table.closesAt} > ${table.opensAt}`,
    ),
    teamIsolationPolicy(),
  ],
);

// A study-scoped person record: the durable identity that links a
// participant's sessions across waves, their IANA time zone, and the encrypted
// tier holding every contact detail and researcher-defined attribute.
const participants = pgTable(
  'participants',
  {
    id: uuid('id').primaryKey(),
    studyId: uuid('study_id').notNull(),
    teamId: text('team_id').notNull(),
    // The non-PII handle. This — never a name — is what appears in the UI
    // without the PII grant, in exports, in audit labels, and in monitoring.
    participantCode: text('participant_code').notNull(),
    // IANA zone, first-class. Shape-checked here; membership of the IANA set is
    // validated in the application, because pg_timezone_names is not immutable
    // and so cannot appear in a CHECK.
    timezone: text('timezone').notNull().default('UTC'),
    // The schedule anchor (participant enrolment date).
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }),

    // ---- The encrypted tier -------------------------------------------------
    emailCiphertext: bytea('email_ciphertext'),
    emailIndex: bytea('email_index'),
    phoneCiphertext: bytea('phone_ciphertext'),
    phoneIndex: bytea('phone_index'),
    nameCiphertext: bytea('name_ciphertext'),
    // The researcher-defined attribute bag, encrypted whole. Not JSONB: a
    // ciphertext is opaque, and storing it as JSONB would invite a
    // server-side query into it that cannot work.
    attributesCiphertext: bytea('attributes_ciphertext'),
    piiKeyId: text('pii_key_id'),
    piiAlgorithm: text('pii_algorithm'),

    // Provenance for the audited copy/transfer tool. No foreign keys: the
    // source study may since have been purged, and the audit event is the
    // authoritative record of the move.
    sourceParticipantId: uuid('source_participant_id'),
    sourceStudyId: uuid('source_study_id'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    unique().on(table.id, table.studyId, table.teamId),
    unique().on(table.studyId, table.participantCode),
    foreignKey({
      columns: [table.studyId, table.teamId],
      foreignColumns: [studies.id, studies.teamId],
    }),
    index('participants_team_id_study_id_created_at_id_idx').on(
      table.teamId,
      table.studyId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    // The blind-index equality lookup, team-first. Partial: anonymous studies
    // hold no participants and managed ones need not hold an email.
    index('participants_team_id_study_id_email_index_idx')
      .on(table.teamId, table.studyId, table.emailIndex)
      .where(sql`${table.emailIndex} IS NOT NULL`),
    index('participants_team_id_study_id_phone_index_idx')
      .on(table.teamId, table.studyId, table.phoneIndex)
      .where(sql`${table.phoneIndex} IS NOT NULL`),
    check(
      'participants_participant_code_check',
      sql`${table.participantCode} ~ '[^[:space:]]'
          AND char_length(${table.participantCode}) <= 128`,
    ),
    // Shape only. DST-correct arithmetic depends on the zone actually being an
    // IANA name, which the application validates against Intl before writing.
    check(
      'participants_timezone_check',
      sql`${table.timezone} ~ '^[A-Za-z][A-Za-z0-9+_-]*(/[A-Za-z0-9+._-]+)*$'
          AND char_length(${table.timezone}) BETWEEN 1 AND 64`,
    ),
    // A blind index without its ciphertext cannot be decrypted; a ciphertext
    // without its blind index cannot be found. Neither is ever correct.
    check(
      'participants_blind_index_pairing_check',
      sql`(${table.emailCiphertext} IS NULL) = (${table.emailIndex} IS NULL)
          AND (${table.phoneCiphertext} IS NULL) = (${table.phoneIndex} IS NULL)`,
    ),
    // Every ciphertext names the key and algorithm that produced it, so
    // rotation is a per-row property rather than an instance-wide flag day.
    check(
      'participants_pii_key_check',
      sql`(${table.piiKeyId} IS NULL) = (${table.piiAlgorithm} IS NULL)
          AND (
            ${table.piiKeyId} IS NOT NULL
            OR num_nonnulls(
              ${table.emailCiphertext}, ${table.phoneCiphertext},
              ${table.nameCiphertext}, ${table.attributesCiphertext}
            ) = 0
          )`,
    ),
    check(
      'participants_source_check',
      sql`(${table.sourceParticipantId} IS NULL) = (${table.sourceStudyId} IS NULL)`,
    ),
    teamIsolationPolicy(),
  ],
);

// The tokenized entry point to a wave: opaque, revocable, expirable,
// per-participant or open. A link exists before any session does, which is why
// it cannot be columns on a session. Token wire format is
// `<team_id>.<base64url(32 random bytes)>`, so redemption can pin a tenant
// before reading anything.
const interviewLinks = pgTable(
  'interview_links',
  {
    id: uuid('id').primaryKey(),
    studyId: uuid('study_id').notNull(),
    teamId: text('team_id').notNull(),
    // NOT NULL for both kinds. The anonymous link is called "per-study"; in
    // the schema that is a link whose wave is the study's only wave. Naming it
    // costs nothing now and is exactly the relaxation an anonymous repeated
    // cross-sectional design would need.
    waveId: uuid('wave_id').notNull(),
    participantId: uuid('participant_id'),
    kind: text('kind').notNull(),
    tokenHash: bytea('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    redemptionCount: integer('redemption_count').notNull().default(0),
    lastRedeemedAt: timestamp('last_redeemed_at', { withTimezone: true }),
    createdByUserId: text('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    // Redemption is one indexed lookup inside the pinned tenant.
    uniqueIndex('interview_links_team_id_token_hash_idx').on(
      table.teamId,
      table.tokenHash,
    ),
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
    index('interview_links_team_id_wave_id_participant_id_idx').on(
      table.teamId,
      table.waveId,
      table.participantId,
    ),
    // At most one live participant link per wave: reissuing revokes first.
    // Expiry is not in the predicate because `now()` is not immutable.
    uniqueIndex('interview_links_live_participant_idx')
      .on(table.waveId, table.participantId)
      .where(sql`${table.kind} = 'participant' AND ${table.revokedAt} IS NULL`),
    check(
      'interview_links_kind_check',
      sql`${table.kind} IN ('participant', 'anonymous')
          AND (${table.kind} = 'participant') = (${table.participantId} IS NOT NULL)`,
    ),
    check(
      'interview_links_redemption_count_check',
      sql`${table.redemptionCount} >= 0
          AND (${table.redemptionCount} = 0) = (${table.lastRedeemedAt} IS NULL)`,
    ),
    check(
      'interview_links_token_hash_check',
      sql`octet_length(${table.tokenHash}) = 32`,
    ),
    teamIsolationPolicy(),
  ],
);

// One participant's (or one anonymous visitor's) run through one wave's pinned
// protocol version: its delivery mode, initiating researcher, stage-granular
// resume state, ego attributes, activity and terminal timestamps, and the
// takeover epoch that makes a second concurrent open safe.
//
// `initiated_by_user_id` deliberately carries no foreign key to `"user"`,
// following `audit_events.actor_id`: an actor reference on a durable record
// must not make the actor undeletable, and must not vanish if the account does.
// The initiating researcher's display name is read live and falls back to the
// id.
const interviewSessions = pgTable(
  'interview_sessions',
  {
    id: uuid('id').primaryKey(),
    studyId: uuid('study_id').notNull(),
    teamId: text('team_id').notNull(),
    waveId: uuid('wave_id').notNull(),
    // NULL in anonymous studies; proven same-study when present.
    participantId: uuid('participant_id'),
    // The session's OWN pin, captured from the wave's pin at creation. The
    // wave's pin says what new sessions will run; this says what this session
    // ran. Rebinding a wave can therefore never change an in-flight interview
    // or orphan completed data.
    protocolVersionId: uuid('protocol_version_id').notNull(),
    // Which link produced this session. No cascade, nullable: a
    // researcher-led session is started from the dashboard, not from a link.
    linkId: uuid('link_id'),

    deliveryMode: text('delivery_mode').notNull().default('self_administered'),
    initiatedByUserId: text('initiated_by_user_id'),

    status: text('status').notNull().default('in_progress'),
    currentStageIndex: integer('current_stage_index').notNull().default(0),
    currentStageId: text('current_stage_id'),
    // The runtime's opaque per-stage scratch state (`stageMetadata` in
    // @codaco/interview / generateNetwork): Record<stageId, unknown>. Never
    // queried by Studio, read and written whole, bounded by the protocol's
    // stage count.
    stageMetadata: jsonb('stage_metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),

    // The ego entity of NcNetwork. Exactly one per session, so a 1:1 table
    // would be pure overhead; ego variables are a researcher-defined
    // attribute bag.
    egoUid: text('ego_uid').notNull(),
    egoAttributes: jsonb('ego_attributes')
      .notNull()
      .default(sql`'{}'::jsonb`),
    egoSecureAttributes: jsonb('ego_secure_attributes'),

    // Takeover, not presence: a writer presents the epoch it holds, and a
    // second open bumps it, making the first read-only. Presence itself is
    // ephemeral in-process state, explicitly outside the datastore.
    holderId: text('holder_id'),
    holderEpoch: bigint('holder_epoch', { mode: 'bigint' })
      .notNull()
      .default(0n),

    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    abandonedAt: timestamp('abandoned_at', { withTimezone: true }),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    unique().on(table.id, table.studyId, table.teamId),
    // The same-study proof: without the shared study_id, a session could
    // validly link a wave from study A to a participant from study B,
    // corrupting attribution and letting one study's participant erasure
    // reach another study's data.
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
    foreignKey({
      columns: [table.protocolVersionId, table.teamId],
      foreignColumns: [protocolVersions.id, protocolVersions.teamId],
    }),
    // Same team only; `interview_sessions_link_own` proves the link opens
    // this session's wave for this session's participant, which a key could
    // do only at the price of another unique index on this table.
    foreignKey({
      columns: [table.linkId, table.teamId],
      foreignColumns: [interviewLinks.id, interviewLinks.teamId],
    }),
    // Monitoring: per-wave session states.
    index('interview_sessions_team_id_wave_id_status_idx').on(
      table.teamId,
      table.waveId,
      table.status,
    ),
    // Prior-data resolution and cross-wave linkage.
    index('interview_sessions_team_id_participant_id_wave_id_idx')
      .on(table.teamId, table.participantId, table.waveId)
      .where(sql`${table.participantId} IS NOT NULL`),
    // One live session per participant per wave. Resume and takeover reuse
    // this row; a reopened abandoned session is the same row.
    uniqueIndex('interview_sessions_wave_id_participant_id_idx')
      .on(table.waveId, table.participantId)
      .where(sql`${table.participantId} IS NOT NULL`),
    // The abandonment sweep is the second cross-team maintenance query in the
    // domain, so it gets a partial index that does not lead with team_id.
    index('interview_sessions_abandonment_scan_idx')
      .on(table.lastActivityAt)
      .where(sql`${table.status} = 'in_progress'`),
    check(
      'interview_sessions_status_check',
      sql`${table.status} IN ('in_progress', 'completed', 'abandoned')`,
    ),
    check(
      'interview_sessions_delivery_mode_check',
      sql`${table.deliveryMode} IN ('self_administered', 'researcher_led')
          AND (${table.deliveryMode} = 'researcher_led')
              = (${table.initiatedByUserId} IS NOT NULL)`,
    ),
    check(
      'interview_sessions_terminal_state_check',
      sql`(${table.status} = 'completed') = (${table.completedAt} IS NOT NULL)
          AND (${table.status} = 'abandoned') = (${table.abandonedAt} IS NOT NULL)`,
    ),
    check(
      'interview_sessions_stage_check',
      sql`${table.currentStageIndex} >= 0
          AND (${table.currentStageId} IS NULL
               OR char_length(${table.currentStageId}) BETWEEN 1 AND 128)`,
    ),
    check(
      'interview_sessions_holder_check',
      sql`${table.holderEpoch} >= 0
          AND (${table.holderId} IS NULL OR char_length(${table.holderId}) BETWEEN 1 AND 128)`,
    ),
    check(
      'interview_sessions_ego_check',
      sql`char_length(${table.egoUid}) BETWEEN 1 AND 128
          AND jsonb_typeof(${table.egoAttributes}) = 'object'
          AND jsonb_typeof(${table.stageMetadata}) = 'object'
          AND (${table.egoSecureAttributes} IS NULL
               OR jsonb_typeof(${table.egoSecureAttributes}) = 'object')`,
    ),
    teamIsolationPolicy(),
  ],
);

export const STUDY_TABLES = {
  studies,
  studyWaves,
  participants,
  interviewSessions,
  interviewLinks,
};

// Hashed into the schema fingerprint — whitespace counts. CREATE OR REPLACE
// because DROP TABLE CASCADE leaves functions behind, and an `already exists`
// error reads as transient to the boot retry loop.
export const STUDY_SIDECAR_SQL = `
-- Closed studies are read-only, deny-by-default: a column added to \`studies\`
-- after this trigger fails closed instead of silently becoming writable.
CREATE OR REPLACE FUNCTION studies_closed_is_read_only() RETURNS trigger AS $$
DECLARE
  allowed text[] := ARRAY[
    'state', 'deletion_requested_at', 'purge_after', 'closed_at', 'updated_at'
  ];
BEGIN
  IF OLD.state <> 'closed' THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(OLD) - allowed) IS DISTINCT FROM (to_jsonb(NEW) - allowed) THEN
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;

  -- \`state\` being writable is not a free exit. The only permitted way out of
  -- \`closed\` is the exact write reopenStudy makes.
  IF NEW.state <> 'closed'
     AND NOT (NEW.state = 'live' AND NEW.closed_at IS NULL) THEN
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;

  -- \`closed_at\` rides the allowlist only so the reopen above can clear it.
  -- While the study stays closed the timestamp is the archive's date of
  -- record — what the retention clock and every export header are read
  -- against — so rewriting it in place would move when the study closed with
  -- no state change to account for the move.
  IF NEW.state = 'closed' AND NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER studies_closed_read_only
  BEFORE UPDATE ON studies
  FOR EACH ROW EXECUTE FUNCTION studies_closed_is_read_only();

-- Participation mode decides whether a study holds identified participants at
-- all, and \`went_live_at\` is the evidence that the decision has been acted
-- on. Once collection has begun under one mode, switching would reinterpret
-- data already collected — an anonymous run's sessions have no participant to
-- attribute to — and clearing the timestamp would erase the very evidence
-- that forbids the switch. Both freeze on the FIRST go-live, so a pause, a
-- close and a reopen all leave them alone; \`studies_closed_read_only\` catches
-- a closed study's attempt before this trigger, because neither column is on
-- its allowlist.
CREATE OR REPLACE FUNCTION studies_go_live_is_final() RETURNS trigger AS $$
BEGIN
  IF NEW.participation_mode IS DISTINCT FROM OLD.participation_mode THEN
    RAISE EXCEPTION 'a study that has gone live cannot change participation mode';
  END IF;
  IF NEW.went_live_at IS DISTINCT FROM OLD.went_live_at THEN
    RAISE EXCEPTION 'a study''s first go-live is recorded once and never rewritten';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER studies_go_live_final
  BEFORE UPDATE ON studies
  FOR EACH ROW
  WHEN (OLD.went_live_at IS NOT NULL
        AND (NEW.participation_mode IS DISTINCT FROM OLD.participation_mode
             OR NEW.went_live_at IS DISTINCT FROM OLD.went_live_at))
  EXECUTE FUNCTION studies_go_live_is_final();

-- The retarget half of the wave-pin invariant \`study_waves_version_own_line\`
-- proves below. \`studies.protocol_id\` is nullable so a Draft can be pointed
-- at a different protocol, and the command layer clears every wave pin before
-- it does; this refuses the retarget that skipped that step, which would
-- leave pins the wave trigger admitted naming versions of the line the study
-- has just walked away from. AFTER the row, so the composite key to
-- \`protocols\` reports a protocol from another team first.
--
-- Alone among these guards this one refuses on a row it FINDS, so it would
-- fail open if row-level security hid the pinned wave. It cannot: the caller
-- is updating this study, so its policy has already pinned the study's team,
-- and every wave of that study carries the same team_id.
CREATE OR REPLACE FUNCTION studies_protocol_line_is_unpinned() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM study_waves w
    WHERE w.study_id = NEW.id AND w.team_id = NEW.team_id
      AND w.protocol_version_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'a study''s protocol line cannot change while a wave still pins a version';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER studies_protocol_line_unpinned
  AFTER UPDATE OF protocol_id ON studies
  FOR EACH ROW
  WHEN (NEW.protocol_id IS DISTINCT FROM OLD.protocol_id)
  EXECUTE FUNCTION studies_protocol_line_is_unpinned();

-- A study leaves the database by exactly one path: the maintenance purge,
-- after the retention window \`deletion_requested_at\` and \`purge_after\`
-- describe. The blanket tenant grant includes DELETE, so without this the
-- application role could remove a study whose children were gone — a draft,
-- or one marked for deletion — the moment it was asked, skipping the window.
CREATE OR REPLACE FUNCTION study_delete_is_purge() RETURNS trigger AS $$
BEGIN
  IF current_user = 'studio_maintenance' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'studies are deleted only by the maintenance purge';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER studies_delete_purge_only
  BEFORE DELETE ON studies
  FOR EACH ROW EXECUTE FUNCTION study_delete_is_purge();

-- Shared by every child guard below.
CREATE OR REPLACE FUNCTION study_is_closed(p_study_id uuid, p_team_id text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM studies s
    WHERE s.id = p_study_id AND s.team_id = p_team_id AND s.state = 'closed'
  );
$$ LANGUAGE sql STABLE;

-- Wave identity is immutable: sessions attach to waves, and a renumbered wave
-- would silently reattribute collected data.
CREATE OR REPLACE FUNCTION study_waves_identity_is_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.wave_number IS DISTINCT FROM OLD.wave_number
     OR NEW.study_id IS DISTINCT FROM OLD.study_id
     OR NEW.team_id IS DISTINCT FROM OLD.team_id
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'wave identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER study_waves_identity_immutable
  BEFORE UPDATE ON study_waves
  FOR EACH ROW EXECUTE FUNCTION study_waves_identity_is_immutable();

-- A closed study's waves are read-only, except that the maintenance purge may
-- DELETE them. The exemption is scoped to DELETE because the purge only ever
-- deletes: a maintenance INSERT or UPDATE under a closed study stays blocked
-- like any other role's. Because the \`studies\` trigger guards only UPDATE, it
-- is this trigger plus the no-cascade FK that makes a closed study undeletable
-- by the application role at the database level.
CREATE OR REPLACE FUNCTION study_waves_parent_is_open() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT study_is_closed(OLD.study_id, OLD.team_id) THEN
      RETURN OLD;
    END IF;
    IF current_user = 'studio_maintenance' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;

  IF study_is_closed(NEW.study_id, NEW.team_id) THEN
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER study_waves_parent_open
  BEFORE INSERT OR UPDATE OR DELETE ON study_waves
  FOR EACH ROW EXECUTE FUNCTION study_waves_parent_is_open();

-- A wave's pin must name a version of the STUDY's own protocol line. The
-- composite key on (protocol_version_id, team_id) proves only that the version
-- is the team's, so without this a writer could pin a sibling study's line and
-- leave a collecting wave running a protocol its study never chose — every
-- session of that wave then carrying a version pin that \`studies.protocol_id\`
-- disagrees with. A study with no line yet pins nothing: the comparison
-- against a null \`protocol_id\` finds no row, which is the intended refusal.
--
-- AFTER the row, so the key reports first: a version from another team is a
-- key violation, not a line mismatch.
CREATE OR REPLACE FUNCTION study_wave_version_is_own_line() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM studies s
    JOIN protocol_versions v
      ON v.id = NEW.protocol_version_id AND v.team_id = NEW.team_id
    WHERE s.id = NEW.study_id AND s.team_id = NEW.team_id
      AND v.protocol_id = s.protocol_id
  ) THEN
    RAISE EXCEPTION 'a wave''s protocol version must belong to its study''s protocol line';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER study_waves_version_own_line
  AFTER INSERT OR UPDATE OF protocol_version_id ON study_waves
  FOR EACH ROW
  WHEN (NEW.protocol_version_id IS NOT NULL)
  EXECUTE FUNCTION study_wave_version_is_own_line();

-- Participants and sessions carry their own parent-state guard: the triggers
-- above cover only \`studies\` and \`study_waves\`, so without this a buggy
-- write could still modify an archived study's collected data.
--
-- Two delete paths are exempt, and only two. The maintenance purge runs as
-- \`studio_maintenance\`. Participant erasure runs as \`studio_app\` — the same
-- role as any buggy delete — so it cannot key on \`current_user\`; it presents a
-- transaction-scoped marker instead, and the marker is proven against the row's
-- own participant, so it authorizes deleting exactly that participant and
-- nothing else.
CREATE OR REPLACE FUNCTION participants_are_writable() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('${ERASURE_GUC}', true), '');
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT study_is_closed(OLD.study_id, OLD.team_id) THEN
      -- An open study still constrains WHO may erase: outside a marked
      -- erasure or the purge, a participant delete is refused everywhere.
      IF current_user = 'studio_maintenance' OR marker = OLD.id::text THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'participant rows are deleted only by an audited erasure or the maintenance purge';
    END IF;
    IF current_user = 'studio_maintenance' OR marker = OLD.id::text THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;

  IF study_is_closed(NEW.study_id, NEW.team_id) THEN
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;
  IF TG_OP = 'UPDATE'
     AND (NEW.id IS DISTINCT FROM OLD.id
          OR NEW.study_id IS DISTINCT FROM OLD.study_id
          OR NEW.team_id IS DISTINCT FROM OLD.team_id) THEN
    RAISE EXCEPTION 'participant identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER participants_writable
  BEFORE INSERT OR UPDATE OR DELETE ON participants
  FOR EACH ROW EXECUTE FUNCTION participants_are_writable();

-- Finalization makes a session immutable, and the immutability MUST be
-- UPDATE-only: deletes stay possible, because both the maintenance purge and
-- the participant-erasure command legitimately delete finalized sessions,
-- each through its own audited path.
CREATE OR REPLACE FUNCTION interview_sessions_are_writable() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('${ERASURE_GUC}', true), '');
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user = 'studio_maintenance'
       OR (marker IS NOT NULL AND marker = OLD.participant_id::text) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'interview sessions are deleted only by an audited erasure or the maintenance purge';
  END IF;

  IF study_is_closed(
       CASE WHEN TG_OP = 'INSERT' THEN NEW.study_id ELSE OLD.study_id END,
       CASE WHEN TG_OP = 'INSERT' THEN NEW.team_id ELSE OLD.team_id END) THEN
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'finalized interview sessions are immutable';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.study_id IS DISTINCT FROM OLD.study_id
     OR NEW.team_id IS DISTINCT FROM OLD.team_id
     OR NEW.wave_id IS DISTINCT FROM OLD.wave_id
     OR NEW.participant_id IS DISTINCT FROM OLD.participant_id
     OR NEW.protocol_version_id IS DISTINCT FROM OLD.protocol_version_id
     OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'interview session identity and version pin are immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER interview_sessions_writable
  BEFORE INSERT OR UPDATE OR DELETE ON interview_sessions
  FOR EACH ROW EXECUTE FUNCTION interview_sessions_are_writable();

-- A link opens one wave for one participant, or for any visitor when
-- anonymous. A session citing a link of another wave or another participant
-- would attribute what it collected to whichever of the two disagrees. The
-- composite key proves the link is the team's; this proves the rest, AFTER
-- the row so the key reports first, and only when the link is set, because
-- wave and participant are immutable above.
CREATE OR REPLACE FUNCTION interview_session_link_is_own() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM interview_links l
    WHERE l.id = NEW.link_id AND l.team_id = NEW.team_id
      AND l.study_id = NEW.study_id
      AND l.wave_id = NEW.wave_id
      AND l.participant_id IS NOT DISTINCT FROM NEW.participant_id
  ) THEN
    RAISE EXCEPTION 'an interview session''s link must open its own wave for its own participant';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER interview_sessions_link_own
  AFTER INSERT OR UPDATE OF link_id ON interview_sessions
  FOR EACH ROW
  WHEN (NEW.link_id IS NOT NULL)
  EXECUTE FUNCTION interview_session_link_is_own();

-- A session's own pin is a COPY of its wave's pin, taken at creation. The
-- composite key proves only that the version is the team's, so without this a
-- session could be created against any of the team's versions and its
-- provenance — including the snapshot's, which is proven against the session
-- rather than against the wave — would record a protocol the wave never
-- served. A wave that pins nothing takes no sessions at all: comparing against
-- a null pin finds no row, and that is the intended refusal.
--
-- INSERT only. The pin is already immutable on a session
-- (\`interview_sessions_writable\`), and re-pinning a wave to a newer version
-- must stay possible — that the sessions already collected keep running the
-- version they started under is the whole reason the session carries its own
-- copy.
CREATE OR REPLACE FUNCTION interview_session_version_is_wave_pin() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM study_waves w
    WHERE w.id = NEW.wave_id AND w.team_id = NEW.team_id
      AND w.protocol_version_id = NEW.protocol_version_id
  ) THEN
    RAISE EXCEPTION 'an interview session must pin the protocol version its wave pins';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER interview_sessions_version_wave_pin
  AFTER INSERT ON interview_sessions
  FOR EACH ROW EXECUTE FUNCTION interview_session_version_is_wave_pin();

-- The same guard as sessions, minus the finalization clause.
CREATE OR REPLACE FUNCTION interview_links_are_writable() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('${ERASURE_GUC}', true), '');
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user = 'studio_maintenance'
       OR (marker IS NOT NULL AND marker = OLD.participant_id::text) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'interview links are deleted only by an audited erasure or the maintenance purge';
  END IF;

  IF study_is_closed(
       CASE WHEN TG_OP = 'INSERT' THEN NEW.study_id ELSE OLD.study_id END,
       CASE WHEN TG_OP = 'INSERT' THEN NEW.team_id ELSE OLD.team_id END) THEN
    RAISE EXCEPTION 'closed studies are read-only';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.id IS DISTINCT FROM OLD.id
          OR NEW.study_id IS DISTINCT FROM OLD.study_id
          OR NEW.team_id IS DISTINCT FROM OLD.team_id
          OR NEW.wave_id IS DISTINCT FROM OLD.wave_id
          OR NEW.participant_id IS DISTINCT FROM OLD.participant_id
          OR NEW.kind IS DISTINCT FROM OLD.kind
          OR NEW.token_hash IS DISTINCT FROM OLD.token_hash) THEN
    RAISE EXCEPTION 'interview link identity and token are immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER interview_links_writable
  BEFORE INSERT OR UPDATE OR DELETE ON interview_links
  FOR EACH ROW EXECUTE FUNCTION interview_links_are_writable();
${tenantTablesSql([
  'studies',
  'study_waves',
  'participants',
  'interview_sessions',
  'interview_links',
])}
`;
