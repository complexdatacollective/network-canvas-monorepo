// Scheduling and messaging (#1304, #1305, #1306). Six tables.
//
// The storage-shape question is answered the way the study spine answers it
// for `studies`: typed columns for everything the resolver branches on, one
// `settings` JSONB for what delivery features will keep adding. The resolver
// reads every field of the grammar on every evaluation, under a per-participant
// time zone, to produce concrete instants — a JSONB blob would make each of
// those a runtime cast with no database-level guarantee that a "one random
// evening per week" schedule is even well-formed. Normalizing further (a
// `recurrence_rules` child table) buys nothing: #1304's grammar is a fixed
// four-part shape, not an open-ended rule list.
//
// Time zones live on the participant, not here: #1304 says "participant-local,
// captured at onboarding and editable on the participant record", and the spine
// confirms the IANA zone is a participant column. `study_schedules` carries only
// a fallback for participants with no recorded zone.
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  teamIsolationPolicy,
  TENANT_ROLES,
  tenantTablesSql,
} from '@codaco/studio-sync/rls';

import { STUDY_TABLES } from '../study/schema.ts';

const { studies, studyWaves, participants } = STUDY_TABLES;

// Declaration order is forced by drizzle evaluating `foreignColumns` eagerly:
//   study_schedules -> schedule_occurrences -> message_templates
//   -> message_deliveries -> message_delivery_events
// (`participant_contact_optouts` references nothing.)

// One researcher-defined schedule — anchor, recurrence, window and constraints
// — over a study or one of its waves.
const studySchedules = pgTable(
  'study_schedules',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    studyId: uuid('study_id').notNull(),
    // Null means study-wide; set means this wave only.
    waveId: uuid('wave_id'),
    name: text('name').notNull(),
    state: text('state').notNull().default('draft'),

    // --- anchor (#1304) ---
    anchorKind: text('anchor_kind').notNull(),
    anchorDate: timestamp('anchor_date', { withTimezone: true }),
    anchorOffsetMinutes: integer('anchor_offset_minutes').notNull().default(0),

    // --- recurrence (#1304) ---
    recurrenceKind: text('recurrence_kind').notNull(),
    intervalDays: integer('interval_days'),
    samplesPerPeriod: integer('samples_per_period'),
    periodDays: integer('period_days'),
    minGapMinutes: integer('min_gap_minutes'),
    occurrenceLimit: integer('occurrence_limit'),

    // --- window (#1304), participant-local minutes past midnight ---
    windowStartMinute: smallint('window_start_minute').notNull().default(0),
    windowEndMinute: smallint('window_end_minute').notNull().default(1439),
    // Bit 0 = Monday … bit 6 = Sunday.
    daysOfWeekMask: smallint('days_of_week_mask').notNull().default(127),

    // --- constraints (#1304) ---
    quietHoursStartMinute: smallint('quiet_hours_start_minute'),
    quietHoursEndMinute: smallint('quiet_hours_end_minute'),
    maxPromptsPerDay: smallint('max_prompts_per_day').notNull().default(1),
    promptExpiryHours: integer('prompt_expiry_hours').notNull().default(24),
    catchUpPolicy: text('catch_up_policy').notNull().default('skip'),

    // Used only when a participant has no recorded IANA zone.
    fallbackTimeZone: text('fallback_time_zone').notNull().default('UTC'),
    channels: text('channels').array().notNull(),
    settings: jsonb('settings')
      .notNull()
      .default(sql`'{}'::jsonb`),
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
    foreignKey({
      name: 'study_schedules_study_fk',
      columns: [table.studyId, table.teamId],
      foreignColumns: [studies.id, studies.teamId],
    }),
    foreignKey({
      name: 'study_schedules_wave_fk',
      columns: [table.waveId, table.studyId, table.teamId],
      foreignColumns: [studyWaves.id, studyWaves.studyId, studyWaves.teamId],
    }),
    index('study_schedules_team_id_study_id_idx').on(
      table.teamId,
      table.studyId,
    ),
    check(
      'study_schedules_state_check',
      sql`${table.state} IN ('draft', 'active', 'paused', 'ended')`,
    ),
    check(
      'study_schedules_anchor_check',
      sql`${table.anchorKind} IN ('enrolment', 'wave_window_start', 'fixed_date')
          AND (${table.anchorKind} = 'fixed_date') = (${table.anchorDate} IS NOT NULL)
          AND (${table.anchorKind} <> 'wave_window_start' OR ${table.waveId} IS NOT NULL)`,
    ),
    // Each recurrence kind carries exactly its own parameters and no others,
    // so a malformed schedule cannot reach the resolver.
    check(
      'study_schedules_recurrence_check',
      sql`${table.recurrenceKind} IN ('one_off', 'fixed_interval', 'random_sample')
          AND (${table.recurrenceKind} = 'fixed_interval') = (${table.intervalDays} IS NOT NULL)
          AND (${table.recurrenceKind} = 'random_sample') = (${table.samplesPerPeriod} IS NOT NULL)
          AND (${table.samplesPerPeriod} IS NULL) = (${table.periodDays} IS NULL)
          AND (${table.samplesPerPeriod} IS NULL) = (${table.minGapMinutes} IS NULL)
          AND (${table.recurrenceKind} <> 'one_off' OR ${table.occurrenceLimit} IS NULL)`,
    ),
    check(
      'study_schedules_recurrence_bounds_check',
      sql`(${table.intervalDays} IS NULL OR ${table.intervalDays} BETWEEN 1 AND 365)
          AND (${table.samplesPerPeriod} IS NULL OR ${table.samplesPerPeriod} BETWEEN 1 AND 24)
          AND (${table.periodDays} IS NULL OR ${table.periodDays} BETWEEN 1 AND 365)
          AND (${table.minGapMinutes} IS NULL OR ${table.minGapMinutes} BETWEEN 0 AND 43200)
          AND (${table.occurrenceLimit} IS NULL OR ${table.occurrenceLimit} BETWEEN 1 AND 10000)
          AND ${table.anchorOffsetMinutes} BETWEEN -43200 AND 43200`,
    ),
    check(
      'study_schedules_window_check',
      sql`${table.windowStartMinute} BETWEEN 0 AND 1439
          AND ${table.windowEndMinute} BETWEEN 0 AND 1439
          AND ${table.windowStartMinute} < ${table.windowEndMinute}
          AND ${table.daysOfWeekMask} BETWEEN 1 AND 127`,
    ),
    check(
      'study_schedules_quiet_hours_check',
      sql`(${table.quietHoursStartMinute} IS NULL) = (${table.quietHoursEndMinute} IS NULL)
          AND (${table.quietHoursStartMinute} IS NULL
               OR (${table.quietHoursStartMinute} BETWEEN 0 AND 1439
                   AND ${table.quietHoursEndMinute} BETWEEN 0 AND 1439))`,
    ),
    check(
      'study_schedules_constraints_check',
      sql`${table.maxPromptsPerDay} BETWEEN 1 AND 24
          AND ${table.promptExpiryHours} BETWEEN 1 AND 8760`,
    ),
    check(
      'study_schedules_catch_up_policy_check',
      sql`${table.catchUpPolicy} IN ('skip', 'reschedule_within_period')`,
    ),
    // coalesce, because array_length of an empty array is NULL, not 0: without
    // it the whole check evaluates to NULL and a schedule with no channel at
    // all is admitted. The same property days_of_week_mask gets from its
    // `>= 1` bound — "nothing to send on" is unrepresentable.
    check(
      'study_schedules_channels_check',
      sql`coalesce(array_length(${table.channels}, 1), 0) BETWEEN 1 AND 2
          AND ${table.channels} <@ ARRAY['email', 'sms']::text[]`,
    ),
    check(
      'study_schedules_settings_object_check',
      sql`jsonb_typeof(${table.settings}) = 'object'`,
    ),
    check(
      'study_schedules_name_check',
      sql`char_length(${table.name}) BETWEEN 1 AND 120
          AND ${table.name} ~ '[^[:space:]]'`,
    ),
    teamIsolationPolicy(),
  ],
);

// The resolved prompt instances. Constrained random sampling must be drawn once
// and stay drawn, so the resolution is durable rows rather than a function
// evaluated at send time.
const scheduleOccurrences = pgTable(
  'schedule_occurrences',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    studyId: uuid('study_id').notNull(),
    scheduleId: uuid('schedule_id').notNull(),
    participantId: uuid('participant_id').notNull(),
    occurrenceIndex: integer('occurrence_index').notNull(),
    // The absolute instant to send at, computed from the local intent below
    // under `resolved_time_zone`.
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    // The participant-local intent, retained so a zone change or a DST
    // transition can be re-resolved rather than guessed at.
    scheduledLocalDate: date('scheduled_local_date').notNull(),
    scheduledLocalMinute: smallint('scheduled_local_minute').notNull(),
    resolvedTimeZone: text('resolved_time_zone').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    state: text('state').notNull().default('scheduled'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    unique().on(table.scheduleId, table.participantId, table.occurrenceIndex),
    foreignKey({
      name: 'schedule_occurrences_schedule_fk',
      columns: [table.scheduleId, table.studyId, table.teamId],
      foreignColumns: [
        studySchedules.id,
        studySchedules.studyId,
        studySchedules.teamId,
      ],
    }),
    foreignKey({
      name: 'schedule_occurrences_participant_fk',
      columns: [table.participantId, table.studyId, table.teamId],
      foreignColumns: [
        participants.id,
        participants.studyId,
        participants.teamId,
      ],
    }),
    // The dispatch scan: due, undispatched, cheapest possible.
    index('schedule_occurrences_due_idx')
      .on(table.scheduledFor)
      .where(sql`state = 'scheduled'`),
    index('schedule_occurrences_team_id_participant_id_scheduled_for_idx').on(
      table.teamId,
      table.participantId,
      table.scheduledFor,
    ),
    check(
      'schedule_occurrences_state_check',
      sql`${table.state} IN ('scheduled', 'dispatched', 'expired', 'cancelled', 'superseded')`,
    ),
    check(
      'schedule_occurrences_bounds_check',
      sql`${table.occurrenceIndex} >= 1
          AND ${table.scheduledLocalMinute} BETWEEN 0 AND 1439
          AND ${table.expiresAt} > ${table.scheduledFor}
          AND char_length(${table.resolvedTimeZone}) BETWEEN 1 AND 64`,
    ),
    teamIsolationPolicy(),
  ],
);

// The researcher-configurable, localized message bodies (#1306), resolved per
// (kind, channel, locale) with a study override over a team default.
const messageTemplates = pgTable(
  'message_templates',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    // Null = team-level default; set = study override.
    studyId: uuid('study_id'),
    kind: text('kind').notNull(),
    channel: text('channel').notNull(),
    locale: text('locale').notNull(),
    version: integer('version').notNull(),
    state: text('state').notNull().default('draft'),
    subject: text('subject'),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    // NULLS NOT DISTINCT so a team-level default collides with itself: with
    // ordinary NULL semantics, two team defaults for the same key would both
    // be admitted and the resolver would pick arbitrarily.
    unique('message_templates_identity_key')
      .on(
        table.teamId,
        table.studyId,
        table.kind,
        table.channel,
        table.locale,
        table.version,
      )
      .nullsNotDistinct(),
    foreignKey({
      name: 'message_templates_study_fk',
      columns: [table.studyId, table.teamId],
      foreignColumns: [studies.id, studies.teamId],
    }),
    index('message_templates_team_id_kind_channel_idx').on(
      table.teamId,
      table.kind,
      table.channel,
    ),
    check(
      'message_templates_kind_check',
      sql`${table.kind} IN ('invitation', 'prompt', 'reminder', 'custom')`,
    ),
    check(
      'message_templates_channel_check',
      sql`${table.channel} IN ('email', 'sms')`,
    ),
    // SMS has no subject line; email must have one.
    check(
      'message_templates_subject_check',
      sql`(${table.channel} = 'email') = (${table.subject} IS NOT NULL)
          AND (${table.subject} IS NULL OR char_length(${table.subject}) BETWEEN 1 AND 200)`,
    ),
    check(
      'message_templates_state_check',
      sql`${table.state} IN ('draft', 'published', 'retired')`,
    ),
    check(
      'message_templates_body_check',
      sql`char_length(${table.body}) BETWEEN 1 AND 8000
          AND ${table.body} ~ '[^[:space:]]'`,
    ),
    check(
      'message_templates_locale_check',
      sql`char_length(${table.locale}) BETWEEN 2 AND 35 AND ${table.version} >= 1`,
    ),
    teamIsolationPolicy(),
  ],
);

// The send outbox, copying `team_invitation_deliveries`' lease/attempt/
// terminal-timestamp shape exactly.
//
// The recipient address is deliberately absent. `team_invitation_deliveries`
// snapshots an email because an invitation's address *is* its identity and no
// participant record exists. Here a participant record does exist, the address
// is encrypted PII (#1258, #1263) that "never leaves the PII boundary
// unaudited" (#1305), and snapshotting it into a long-lived operational table
// would put plaintext PII in the outbox, in backups, and in every operator's
// reach. The dispatcher resolves the address from the participant record inside
// the send, under the audited PII-read path.
const messageDeliveries = pgTable(
  'message_deliveries',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    studyId: uuid('study_id').notNull(),
    participantId: uuid('participant_id').notNull(),
    // Null for a delivery that is not schedule-driven (an invitation or a
    // manually triggered reminder).
    occurrenceId: uuid('occurrence_id'),
    templateId: uuid('template_id').notNull(),
    kind: text('kind').notNull(),
    channel: text('channel').notNull(),
    // HMAC of the normalized recipient address under the deployment's
    // blind-index key (#1246 driver 2). Never reversible; joins the
    // suppression list without storing an address.
    recipientBlindIndex: text('recipient_blind_index').notNull(),
    // sha256 hex of the exact rendered body: proves what was sent without
    // retaining the message (which carries a tokenized interview link).
    renderedBodyHash: text('rendered_body_hash').notNull(),
    provider: text('provider'),
    providerMessageId: text('provider_message_id'),
    attemptCount: integer('attempt_count').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseOwner: uuid('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    suppressedAt: timestamp('suppressed_at', { withTimezone: true }),
    uncertainAt: timestamp('uncertain_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    // One delivery per occurrence per channel: the idempotency key, the same
    // role team_invitation_deliveries' unique(invitation_id) plays.
    uniqueIndex('message_deliveries_occurrence_id_channel_idx')
      .on(table.occurrenceId, table.channel)
      .where(sql`occurrence_id is not null`),
    foreignKey({
      name: 'message_deliveries_participant_fk',
      columns: [table.participantId, table.studyId, table.teamId],
      foreignColumns: [
        participants.id,
        participants.studyId,
        participants.teamId,
      ],
    }),
    foreignKey({
      name: 'message_deliveries_occurrence_fk',
      columns: [table.occurrenceId, table.teamId],
      foreignColumns: [scheduleOccurrences.id, scheduleOccurrences.teamId],
    }),
    foreignKey({
      name: 'message_deliveries_template_fk',
      columns: [table.templateId, table.teamId],
      foreignColumns: [messageTemplates.id, messageTemplates.teamId],
    }),
    index('message_deliveries_dispatch_idx')
      .on(table.availableAt, table.leaseExpiresAt)
      .where(
        sql`sent_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL AND uncertain_at IS NULL`,
      ),
    index('message_deliveries_team_id_study_id_created_at_idx').on(
      table.teamId,
      table.studyId,
      table.createdAt.desc(),
    ),
    index('message_deliveries_team_id_recipient_blind_index_idx').on(
      table.teamId,
      table.recipientBlindIndex,
    ),
    check(
      'message_deliveries_kind_check',
      sql`${table.kind} IN ('invitation', 'prompt', 'reminder', 'custom')`,
    ),
    check(
      'message_deliveries_channel_check',
      sql`${table.channel} IN ('email', 'sms')`,
    ),
    check(
      'message_deliveries_provider_check',
      sql`${table.provider} IS NULL
          OR ${table.provider} IN ('postmark', 'twilio', 'smtp', 'none')`,
    ),
    check(
      'message_deliveries_attempt_count_check',
      sql`${table.attemptCount} >= 0`,
    ),
    check(
      'message_deliveries_hash_check',
      sql`${table.renderedBodyHash} ~ '^[0-9a-f]{64}$'
          AND ${table.recipientBlindIndex} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'message_deliveries_lease_check',
      sql`(${table.leaseOwner} IS NULL) = (${table.leaseExpiresAt} IS NULL)`,
    ),
    check(
      'message_deliveries_terminal_state_check',
      sql`num_nonnulls(${table.sentAt}, ${table.failedAt}, ${table.suppressedAt}, ${table.uncertainAt}) <= 1
          AND (
            num_nonnulls(${table.sentAt}, ${table.failedAt}, ${table.suppressedAt}, ${table.uncertainAt}) = 0
            OR (${table.leaseOwner} IS NULL AND ${table.leaseExpiresAt} IS NULL)
          )`,
    ),
    check(
      'message_deliveries_lengths_check',
      sql`(${table.lastError} IS NULL OR char_length(${table.lastError}) <= 1000)
          AND (${table.providerMessageId} IS NULL
               OR char_length(${table.providerMessageId}) BETWEEN 1 AND 255)`,
    ),
    teamIsolationPolicy(),
  ],
);

// Provider callbacks (delivered, bounced, complained, failed) — at-least-once,
// deduplicated on the provider's own event id.
const messageDeliveryEvents = pgTable(
  'message_delivery_events',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    deliveryId: uuid('delivery_id').notNull(),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    kind: text('kind').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Bounded provider detail: codes and categories, never the message.
    detail: jsonb('detail')
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    unique().on(table.deliveryId, table.provider, table.providerEventId),
    foreignKey({
      name: 'message_delivery_events_delivery_fk',
      columns: [table.deliveryId, table.teamId],
      foreignColumns: [messageDeliveries.id, messageDeliveries.teamId],
    }),
    index('message_delivery_events_team_id_kind_occurred_at_idx').on(
      table.teamId,
      table.kind,
      table.occurredAt.desc(),
    ),
    check(
      'message_delivery_events_kind_check',
      sql`${table.kind} IN ('queued', 'delivered', 'bounced', 'complained', 'failed')`,
    ),
    check(
      'message_delivery_events_provider_check',
      sql`${table.provider} IN ('postmark', 'twilio', 'smtp')`,
    ),
    check(
      'message_delivery_events_detail_object_check',
      sql`jsonb_typeof(${table.detail}) = 'object'`,
    ),
    check(
      'message_delivery_events_provider_event_id_check',
      sql`char_length(${table.providerEventId}) BETWEEN 1 AND 255`,
    ),
    teamIsolationPolicy(),
  ],
);

// Opt-out and suppression, keyed by blind index so it survives participant
// erasure and applies to every study in the team.
const participantContactOptouts = pgTable(
  'participant_contact_optouts',
  {
    teamId: text('team_id').notNull(),
    channel: text('channel').notNull(),
    recipientBlindIndex: text('recipient_blind_index').notNull(),
    source: text('source').notNull(),
    optedOutAt: timestamp('opted_out_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.teamId, table.channel, table.recipientBlindIndex],
    }),
    check(
      'participant_contact_optouts_channel_check',
      sql`${table.channel} IN ('email', 'sms')`,
    ),
    check(
      'participant_contact_optouts_source_check',
      sql`${table.source} IN ('participant_reply', 'provider', 'researcher')`,
    ),
    check(
      'participant_contact_optouts_blind_index_check',
      sql`${table.recipientBlindIndex} ~ '^[0-9a-f]{64}$'`,
    ),
    teamIsolationPolicy(),
  ],
);

export const SCHEDULE_TABLES = {
  studySchedules,
  scheduleOccurrences,
  messageTemplates,
  messageDeliveries,
  messageDeliveryEvents,
  participantContactOptouts,
};

// Hashed into the schema fingerprint — whitespace counts. CREATE OR REPLACE
// because DROP TABLE CASCADE leaves functions behind, and an `already exists`
// error reads as transient to the boot retry loop.
export const SCHEDULE_SIDECAR_SQL = `
-- The fallback zone must be a zone Postgres knows, or every resolution for
-- a participant without a recorded zone fails at send time instead of at
-- configuration time. A CHECK cannot query pg_timezone_names; a trigger can.
CREATE OR REPLACE FUNCTION study_schedules_validate_time_zone() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = NEW.fallback_time_zone
  ) THEN
    RAISE EXCEPTION 'unknown IANA time zone: %', NEW.fallback_time_zone;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER study_schedules_time_zone_known
  BEFORE INSERT OR UPDATE ON study_schedules
  FOR EACH ROW EXECUTE FUNCTION study_schedules_validate_time_zone();

CREATE OR REPLACE FUNCTION schedule_occurrences_validate_time_zone() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = NEW.resolved_time_zone
  ) THEN
    RAISE EXCEPTION 'unknown IANA time zone: %', NEW.resolved_time_zone;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER schedule_occurrences_time_zone_known
  BEFORE INSERT OR UPDATE ON schedule_occurrences
  FOR EACH ROW EXECUTE FUNCTION schedule_occurrences_validate_time_zone();

-- A published template that has been sent is evidence: message_deliveries
-- pins it, and rewriting the body would misattribute what a participant
-- received.
CREATE OR REPLACE FUNCTION message_templates_publication_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'published message templates are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER message_templates_publication_immutable
  BEFORE UPDATE ON message_templates
  FOR EACH ROW
  WHEN (
    OLD.state <> 'draft'
    AND (
      NEW.subject IS DISTINCT FROM OLD.subject
      OR NEW.body IS DISTINCT FROM OLD.body
      OR NEW.kind IS DISTINCT FROM OLD.kind
      OR NEW.channel IS DISTINCT FROM OLD.channel
      OR NEW.locale IS DISTINCT FROM OLD.locale
      OR NEW.version IS DISTINCT FROM OLD.version
    )
  )
  EXECUTE FUNCTION message_templates_publication_is_immutable();

-- The delivery's addressing and content identity are fixed at enqueue; only
-- dispatch state moves. Same shape as invitation_delivery_payload_immutable.
CREATE OR REPLACE FUNCTION message_delivery_payload_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'message delivery payload is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER message_delivery_payload_immutable
  BEFORE UPDATE ON message_deliveries
  FOR EACH ROW
  WHEN (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.study_id IS DISTINCT FROM OLD.study_id
    OR NEW.participant_id IS DISTINCT FROM OLD.participant_id
    OR NEW.occurrence_id IS DISTINCT FROM OLD.occurrence_id
    OR NEW.template_id IS DISTINCT FROM OLD.template_id
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.channel IS DISTINCT FROM OLD.channel
    OR NEW.recipient_blind_index IS DISTINCT FROM OLD.recipient_blind_index
    OR NEW.rendered_body_hash IS DISTINCT FROM OLD.rendered_body_hash
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  )
  EXECUTE FUNCTION message_delivery_payload_is_immutable();

CREATE OR REPLACE TRIGGER message_delivery_events_immutable
  BEFORE UPDATE ON message_delivery_events
  FOR EACH ROW EXECUTE FUNCTION message_delivery_payload_is_immutable();

${tenantTablesSql([
  'study_schedules',
  'schedule_occurrences',
  'message_templates',
  'message_deliveries',
  'message_delivery_events',
  'participant_contact_optouts',
])}

-- Commands enqueue inside their audited transaction; only the maintenance
-- dispatcher advances send state, exactly as for invitation delivery.
REVOKE UPDATE, DELETE ON message_deliveries FROM ${TENANT_ROLES.app};
`;
