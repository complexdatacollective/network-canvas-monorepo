// The scheduling and messaging module's database-enforced promises: the
// cross-field CHECKs that make a malformed recurrence grammar unrepresentable,
// the two triggers that refuse a time zone Postgres does not know, the
// idempotency keys on occurrences and deliveries, the immutability of a
// published template, of a delivery's addressing, and of a provider callback,
// and every composite foreign key's cross-team and cross-study refusal.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK, unique or foreign-key violation, the message for a trigger
// — so a guard that stopped firing cannot pass as "no error".
import { createHash, randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import { ERASURE_GUC } from '../../study/schema.ts';

const db = await reachableDb();

const TEAM_A = 'schedule-team-a';
const TEAM_B = 'schedule-team-b';

type Row = Record<string, unknown>;

/** A 64-character lowercase hex digest, the shape both hash columns demand. */
const hex = (seed: string) => createHash('sha256').update(seed).digest('hex');

// Postgres truncates an identifier at 63 bytes, and drizzle's generated names
// for these two constraints are longer than that. The truncated forms are what
// a violation actually reports, so they are what the oracles must expect.
const OCCURRENCE_IDENTITY_KEY =
  'schedule_occurrences_schedule_id_participant_id_occurrence_inde';
const DELIVERY_EVENT_IDENTITY_KEY =
  'message_delivery_events_delivery_id_provider_provider_event_id_';

describe.skipIf(!db)('schedule and messaging schema', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let maintenance: pg.Pool;
  let dispose: () => Promise<void>;
  let tenantA: TenantDb;

  /** Per team: one study, one wave, one participant, all open. */
  const studyOf: Record<string, string> = {};
  const waveOf: Record<string, string> = {};
  const participantOf: Record<string, string> = {};
  /** A second study in team A, for the cross-study composite-FK oracles. */
  let otherStudyId: string;
  let otherParticipantId: string;

  // The connecting login is the development superuser, so it bypasses the
  // row-level security policies but not the triggers: exactly the fixture tool
  // these cases want. Role-sensitive probes use the `app` and `maintenance`
  // pools instead.
  const insert = (table: string, row: Row) => {
    const columns = Object.keys(row);
    return pool.query(
      `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(row),
    );
  };

  // ---- row builders -------------------------------------------------------

  const scheduleRow = (overrides: Row = {}): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    study_id: studyOf[TEAM_A],
    name: 'Evening prompts',
    anchor_kind: 'enrolment',
    recurrence_kind: 'one_off',
    channels: ['email'],
    ...overrides,
  });

  const occurrenceRow = (scheduleId: string, overrides: Row = {}): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    study_id: studyOf[TEAM_A],
    schedule_id: scheduleId,
    participant_id: participantOf[TEAM_A],
    occurrence_index: 1,
    scheduled_for: new Date('2026-09-10T18:00:00Z'),
    scheduled_local_date: '2026-09-10',
    scheduled_local_minute: 1080,
    resolved_time_zone: 'Europe/London',
    expires_at: new Date('2026-09-11T18:00:00Z'),
    ...overrides,
  });

  // The identity key is NULLS NOT DISTINCT, so every team-level default with
  // the same (kind, channel, locale, version) is the same template. Fixtures
  // that only need *a* template take a fresh version; the cases that exercise
  // the key itself pass an explicit one.
  let nextTemplateVersion = 1000;

  // Published by default, because an enqueue may only cite a published
  // template: a draft fixture would make every accepting delivery case fail
  // for a reason it was not written to test. The cases about the draft
  // lifecycle ask for `state: 'draft'` explicitly.
  const templateRow = (overrides: Row = {}): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    kind: 'prompt',
    channel: 'email',
    locale: 'en-GB',
    version: (nextTemplateVersion += 1),
    state: 'published',
    subject: 'Time for your check-in',
    body: 'Please follow the link.',
    ...overrides,
  });

  const deliveryRow = (templateId: string, overrides: Row = {}): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    study_id: studyOf[TEAM_A],
    participant_id: participantOf[TEAM_A],
    template_id: templateId,
    kind: 'prompt',
    channel: 'email',
    recipient_blind_index: hex(`recipient-${randomUUID()}`),
    rendered_body_hash: hex(`body-${randomUUID()}`),
    ...overrides,
  });

  const eventRow = (deliveryId: string, overrides: Row = {}): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    delivery_id: deliveryId,
    provider: 'postmark',
    provider_event_id: `evt-${randomUUID()}`,
    kind: 'delivered',
    occurred_at: new Date('2026-09-10T18:00:05Z'),
    ...overrides,
  });

  const optoutRow = (overrides: Row = {}): Row => ({
    team_id: TEAM_A,
    channel: 'email',
    recipient_blind_index: hex(`optout-${randomUUID()}`),
    source: 'participant_reply',
    ...overrides,
  });

  async function newSchedule(overrides: Row = {}): Promise<string> {
    const row = scheduleRow(overrides);
    await insert('study_schedules', row);
    return row.id as string;
  }

  async function newOccurrence(
    scheduleId: string,
    overrides: Row = {},
  ): Promise<string> {
    const row = occurrenceRow(scheduleId, overrides);
    await insert('schedule_occurrences', row);
    return row.id as string;
  }

  async function newTemplate(overrides: Row = {}): Promise<string> {
    const row = templateRow(overrides);
    await insert('message_templates', row);
    return row.id as string;
  }

  async function newDelivery(overrides: Row = {}): Promise<string> {
    const row = deliveryRow(await newTemplate(), overrides);
    await insert('message_deliveries', row);
    return row.id as string;
  }

  /**
   * A delivery the dispatcher has already handed to a provider. Every callback
   * fixture sits on one, because an event must name the provider that sent its
   * delivery and a delivery with no provider has been sent by nobody.
   */
  const newAttemptedDelivery = (overrides: Row = {}) =>
    newDelivery({ provider: 'postmark', ...overrides });

  /**
   * The application role inside an audited participant erasure: the same
   * connection, plus the transaction-scoped marker naming the participant
   * being erased.
   */
  function erasing(participantId: string, sql: string, values: unknown[]) {
    return tenantA.transaction(async (client) => {
      await client.query(
        `SET LOCAL ${ERASURE_GUC} = ${pg.escapeLiteral(participantId)}`,
      );
      return client.query(sql, values);
    });
  }

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, maintenance, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);

    for (const teamId of [TEAM_A, TEAM_B]) {
      await seedTeam(pool, teamId);
      const studyId = randomUUID();
      const waveId = randomUUID();
      const participantId = randomUUID();
      studyOf[teamId] = studyId;
      waveOf[teamId] = waveId;
      participantOf[teamId] = participantId;
      await insert('studies', {
        id: studyId,
        team_id: teamId,
        name: `${teamId} study`,
      });
      await insert('study_waves', {
        id: waveId,
        study_id: studyId,
        team_id: teamId,
        wave_number: 1,
      });
      await insert('participants', {
        id: participantId,
        study_id: studyId,
        team_id: teamId,
        participant_code: `P-${teamId}`,
      });
    }

    // A second team-A study, so a cross-study rejection is not also a
    // cross-team one: the three-column keys must catch it on study_id alone.
    otherStudyId = randomUUID();
    otherParticipantId = randomUUID();
    await insert('studies', {
      id: otherStudyId,
      team_id: TEAM_A,
      name: 'second team-a study',
    });
    await insert('participants', {
      id: otherParticipantId,
      study_id: otherStudyId,
      team_id: TEAM_A,
      participant_code: 'P-other',
    });

    tenantA = createTenantDb(app, TEAM_A);
  });

  afterAll(async () => {
    await dispose();
  });

  describe('study_schedules: the recurrence grammar', () => {
    it('applies the documented defaults', async () => {
      const scheduleId = await newSchedule();

      const row = await pool.query<Row>(
        `SELECT state, anchor_offset_minutes, window_start_minute,
                window_end_minute, days_of_week_mask, quiet_hours_start_minute,
                quiet_hours_end_minute, max_prompts_per_day,
                prompt_expiry_hours, catch_up_policy, fallback_time_zone,
                settings
         FROM study_schedules WHERE id = $1`,
        [scheduleId],
      );
      expect(row.rows[0]).toEqual({
        state: 'draft',
        anchor_offset_minutes: 0,
        window_start_minute: 0,
        window_end_minute: 1439,
        days_of_week_mask: 127,
        quiet_hours_start_minute: null,
        quiet_hours_end_minute: null,
        max_prompts_per_day: 1,
        prompt_expiry_hours: 24,
        catch_up_policy: 'skip',
        fallback_time_zone: 'UTC',
        settings: {},
      });
    });

    it.each([
      // --- state, name, settings, channels ---
      [
        'an unknown state',
        { state: 'archived' },
        'study_schedules_state_check',
      ],
      ['a blank name', { name: '   ' }, 'study_schedules_name_check'],
      [
        'a name past 120 characters',
        { name: 'x'.repeat(121) },
        'study_schedules_name_check',
      ],
      [
        'scalar settings',
        { settings: JSON.stringify(3) },
        'study_schedules_settings_object_check',
      ],
      ['no channel at all', { channels: [] }, 'study_schedules_channels_check'],
      [
        'an unknown channel',
        { channels: ['pigeon'] },
        'study_schedules_channels_check',
      ],
      [
        'more channels than exist',
        { channels: ['email', 'sms', 'email'] },
        'study_schedules_channels_check',
      ],
      // Two elements, both allowed, within the length bound — and still one
      // channel, sent to twice.
      [
        'the same channel twice',
        { channels: ['email', 'email'] },
        'study_schedules_channels_check',
      ],
      [
        'the other channel twice',
        { channels: ['sms', 'sms'] },
        'study_schedules_channels_check',
      ],

      // --- anchor ---
      [
        'an unknown anchor kind',
        { anchor_kind: 'phase_of_moon' },
        'study_schedules_anchor_check',
      ],
      [
        'a fixed-date anchor with no date',
        { anchor_kind: 'fixed_date' },
        'study_schedules_anchor_check',
      ],
      [
        'an enrolment anchor carrying a date',
        { anchor_kind: 'enrolment', anchor_date: new Date() },
        'study_schedules_anchor_check',
      ],
      [
        'a wave-window anchor with no wave',
        { anchor_kind: 'wave_window_start', wave_id: null },
        'study_schedules_anchor_check',
      ],

      // --- recurrence: each kind carries exactly its own parameters ---
      [
        'an unknown recurrence kind',
        { recurrence_kind: 'fortnightly' },
        'study_schedules_recurrence_check',
      ],
      [
        'a fixed interval with no interval',
        { recurrence_kind: 'fixed_interval' },
        'study_schedules_recurrence_check',
      ],
      [
        'a one-off carrying an interval',
        { recurrence_kind: 'one_off', interval_days: 7 },
        'study_schedules_recurrence_check',
      ],
      [
        'a one-off carrying an occurrence limit',
        { recurrence_kind: 'one_off', occurrence_limit: 5 },
        'study_schedules_recurrence_check',
      ],
      [
        'a random sample with no sample count',
        {
          recurrence_kind: 'random_sample',
          period_days: 7,
          min_gap_minutes: 60,
        },
        'study_schedules_recurrence_check',
      ],
      [
        'a fixed interval carrying a sample count',
        {
          recurrence_kind: 'fixed_interval',
          interval_days: 7,
          samples_per_period: 3,
          period_days: 7,
          min_gap_minutes: 60,
        },
        'study_schedules_recurrence_check',
      ],
      // K per period without a period, and a min gap without a K: the
      // sample parameters stand or fall together.
      [
        'a sample count with no period',
        {
          recurrence_kind: 'random_sample',
          samples_per_period: 3,
          min_gap_minutes: 60,
        },
        'study_schedules_recurrence_check',
      ],
      [
        'a sample count with no minimum gap',
        {
          recurrence_kind: 'random_sample',
          samples_per_period: 3,
          period_days: 7,
        },
        'study_schedules_recurrence_check',
      ],
      [
        'a minimum gap with no sample count',
        { recurrence_kind: 'one_off', min_gap_minutes: 60 },
        'study_schedules_recurrence_check',
      ],
      [
        'a period with no sample count',
        { recurrence_kind: 'one_off', period_days: 7 },
        'study_schedules_recurrence_check',
      ],

      // --- recurrence bounds ---
      [
        'a zero-day interval',
        { recurrence_kind: 'fixed_interval', interval_days: 0 },
        'study_schedules_recurrence_bounds_check',
      ],
      [
        'an interval past a year',
        { recurrence_kind: 'fixed_interval', interval_days: 366 },
        'study_schedules_recurrence_bounds_check',
      ],
      [
        'more than 24 samples per period',
        {
          recurrence_kind: 'random_sample',
          samples_per_period: 25,
          period_days: 7,
          min_gap_minutes: 60,
        },
        'study_schedules_recurrence_bounds_check',
      ],
      [
        'a negative minimum gap',
        {
          recurrence_kind: 'random_sample',
          samples_per_period: 3,
          period_days: 7,
          min_gap_minutes: -1,
        },
        'study_schedules_recurrence_bounds_check',
      ],
      [
        'an anchor offset past thirty days',
        { anchor_offset_minutes: 43_201 },
        'study_schedules_recurrence_bounds_check',
      ],

      // --- window ---
      [
        'a window that ends before it starts',
        { window_start_minute: 1260, window_end_minute: 1080 },
        'study_schedules_window_check',
      ],
      [
        'a window of zero width',
        { window_start_minute: 600, window_end_minute: 600 },
        'study_schedules_window_check',
      ],
      [
        'a window minute past midnight',
        { window_end_minute: 1440 },
        'study_schedules_window_check',
      ],
      [
        'a days-of-week mask with no eligible day',
        { days_of_week_mask: 0 },
        'study_schedules_window_check',
      ],
      [
        'a days-of-week mask past seven bits',
        { days_of_week_mask: 128 },
        'study_schedules_window_check',
      ],

      // --- quiet hours and the per-day constraints ---
      [
        'a quiet-hours start with no end',
        { quiet_hours_start_minute: 1320 },
        'study_schedules_quiet_hours_check',
      ],
      [
        'a quiet-hours end with no start',
        { quiet_hours_end_minute: 420 },
        'study_schedules_quiet_hours_check',
      ],
      [
        'a quiet-hours minute past midnight',
        { quiet_hours_start_minute: 1320, quiet_hours_end_minute: 1440 },
        'study_schedules_quiet_hours_check',
      ],
      [
        'no prompts per day',
        { max_prompts_per_day: 0 },
        'study_schedules_constraints_check',
      ],
      [
        'more prompts per day than hours',
        { max_prompts_per_day: 25 },
        'study_schedules_constraints_check',
      ],
      [
        'a zero-hour prompt expiry',
        { prompt_expiry_hours: 0 },
        'study_schedules_constraints_check',
      ],
      [
        'an unknown catch-up policy',
        { catch_up_policy: 'retry_forever' },
        'study_schedules_catch_up_policy_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      await expect(
        insert('study_schedules', scheduleRow(overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it.each([
      [
        'a one-off with no recurrence parameters',
        { recurrence_kind: 'one_off' },
      ],
      [
        'a fixed interval carrying only its interval',
        { recurrence_kind: 'fixed_interval', interval_days: 3 },
      ],
      [
        'a fixed interval bounded by an occurrence limit',
        {
          recurrence_kind: 'fixed_interval',
          interval_days: 3,
          occurrence_limit: 12,
        },
      ],
      [
        'a constrained random sample carrying all three parameters',
        {
          recurrence_kind: 'random_sample',
          samples_per_period: 4,
          period_days: 7,
          min_gap_minutes: 90,
        },
      ],
      [
        'a random sample with a zero minimum gap',
        {
          recurrence_kind: 'random_sample',
          samples_per_period: 4,
          period_days: 7,
          min_gap_minutes: 0,
        },
      ],
      [
        'a fixed-date anchor carrying its date',
        { anchor_kind: 'fixed_date', anchor_date: new Date() },
      ],
      [
        'an evening window on weekdays only',
        {
          window_start_minute: 1080,
          window_end_minute: 1260,
          days_of_week_mask: 31,
        },
      ],
      [
        'quiet hours given as a pair',
        { quiet_hours_start_minute: 1320, quiet_hours_end_minute: 420 },
      ],
      ['both channels at once', { channels: ['email', 'sms'] }],
      ['the second channel on its own', { channels: ['sms'] }],
    ])('accepts %s', async (_label, overrides) => {
      await expect(
        insert('study_schedules', scheduleRow(overrides)),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    // Not in the table above: the wave fixture only exists once beforeAll has
    // run, and an it.each table is built while the suite is being collected.
    it('accepts a wave-window anchor scoped to a wave', async () => {
      await expect(
        insert(
          'study_schedules',
          scheduleRow({
            anchor_kind: 'wave_window_start',
            wave_id: waveOf[TEAM_A],
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses a schedule whose team disagrees with its study', async () => {
      await expect(
        insert('study_schedules', scheduleRow({ team_id: TEAM_B })),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'study_schedules_study_fk',
        detail: expect.stringContaining('is not present in table "studies"'),
      });
    });

    it('refuses a wave from another study', async () => {
      await expect(
        insert(
          'study_schedules',
          scheduleRow({ wave_id: waveOf[TEAM_B], study_id: otherStudyId }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'study_schedules_wave_fk',
        detail: expect.stringContaining(
          'is not present in table "study_waves"',
        ),
      });
    });
  });

  describe('the time-zone triggers', () => {
    it('accepts a real IANA zone as a schedule fallback', async () => {
      await expect(
        insert(
          'study_schedules',
          scheduleRow({ fallback_time_zone: 'Pacific/Auckland' }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('rejects a zone Postgres does not know', async () => {
      await expect(
        insert(
          'study_schedules',
          scheduleRow({ fallback_time_zone: 'Mars/Olympus_Mons' }),
        ),
      ).rejects.toThrow('unknown IANA time zone: Mars/Olympus_Mons');
    });

    it('re-checks the schedule zone on update', async () => {
      const scheduleId = await newSchedule();
      await expect(
        pool.query(
          `UPDATE study_schedules SET fallback_time_zone = 'Mars/Olympus_Mons'
           WHERE id = $1`,
          [scheduleId],
        ),
      ).rejects.toThrow('unknown IANA time zone: Mars/Olympus_Mons');
      await expect(
        pool.query(
          `UPDATE study_schedules SET fallback_time_zone = 'America/Sao_Paulo'
           WHERE id = $1`,
          [scheduleId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('accepts a real IANA zone on a resolved occurrence', async () => {
      const scheduleId = await newSchedule();
      await expect(
        insert(
          'schedule_occurrences',
          occurrenceRow(scheduleId, { resolved_time_zone: 'Asia/Kolkata' }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('rejects an unknown zone on a resolved occurrence', async () => {
      const scheduleId = await newSchedule();
      await expect(
        insert(
          'schedule_occurrences',
          occurrenceRow(scheduleId, { resolved_time_zone: 'Middle/Earth' }),
        ),
      ).rejects.toThrow('unknown IANA time zone: Middle/Earth');
    });
  });

  describe('schedule_occurrences', () => {
    it.each([
      [
        'an unknown state',
        { state: 'posted' },
        'schedule_occurrences_state_check',
      ],
      [
        'a zeroth occurrence',
        { occurrence_index: 0 },
        'schedule_occurrences_bounds_check',
      ],
      [
        'a local minute past midnight',
        { scheduled_local_minute: 1440 },
        'schedule_occurrences_bounds_check',
      ],
      [
        'an expiry at or before the send instant',
        {
          scheduled_for: new Date('2026-09-10T18:00:00Z'),
          expires_at: new Date('2026-09-10T18:00:00Z'),
        },
        'schedule_occurrences_bounds_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      const scheduleId = await newSchedule();
      await expect(
        insert('schedule_occurrences', occurrenceRow(scheduleId, overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('makes re-resolution idempotent per participant and index', async () => {
      const scheduleId = await newSchedule();
      await newOccurrence(scheduleId, { occurrence_index: 1 });

      await expect(
        insert(
          'schedule_occurrences',
          occurrenceRow(scheduleId, { occurrence_index: 1 }),
        ),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: OCCURRENCE_IDENTITY_KEY,
      });

      // A second index, and the same index for a different participant, are
      // both distinct draws rather than collisions.
      await expect(
        insert(
          'schedule_occurrences',
          occurrenceRow(scheduleId, { occurrence_index: 2 }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('holds the draw immutable', async () => {
      const scheduleId = await newSchedule();
      const occurrenceId = await newOccurrence(scheduleId);
      const otherScheduleId = await newSchedule();
      const siblingId = randomUUID();
      await insert('participants', {
        id: siblingId,
        study_id: studyOf[TEAM_A],
        team_id: TEAM_A,
        participant_code: `P-${siblingId.slice(0, 8)}`,
      });

      for (const assignment of [
        `id = '${randomUUID()}'`,
        `team_id = '${TEAM_B}'`,
        `study_id = '${otherStudyId}'`,
        `schedule_id = '${otherScheduleId}'`,
        `participant_id = '${siblingId}'`,
        `occurrence_index = 9`,
        `scheduled_local_date = '2026-09-12'`,
        `scheduled_local_minute = 600`,
        `created_at = now() - interval '1 day'`,
      ]) {
        await expect(
          pool.query(
            `UPDATE schedule_occurrences SET ${assignment} WHERE id = $1`,
            [occurrenceId],
          ),
        ).rejects.toThrow('schedule occurrence identity is immutable');
      }
    });

    it('lets re-resolution and the lifecycle move', async () => {
      const occurrenceId = await newOccurrence(await newSchedule());

      // A zone change or a DST transition re-resolves the same local intent
      // to another instant …
      await expect(
        pool.query(
          `UPDATE schedule_occurrences
           SET resolved_time_zone = 'Pacific/Auckland',
               scheduled_for = $2, expires_at = $3
           WHERE id = $1`,
          [
            occurrenceId,
            new Date('2026-09-10T05:00:00Z'),
            new Date('2026-09-11T05:00:00Z'),
          ],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      // … and the occurrence still runs through its own lifecycle.
      await expect(
        pool.query(
          `UPDATE schedule_occurrences SET state = 'dispatched' WHERE id = $1`,
          [occurrenceId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses a schedule from another study', async () => {
      const scheduleId = await newSchedule();
      await expect(
        insert(
          'schedule_occurrences',
          occurrenceRow(scheduleId, {
            study_id: otherStudyId,
            participant_id: otherParticipantId,
          }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'schedule_occurrences_schedule_fk',
        detail: expect.stringContaining(
          'is not present in table "study_schedules"',
        ),
      });
    });

    it('refuses a participant from another study', async () => {
      const scheduleId = await newSchedule();
      await expect(
        insert(
          'schedule_occurrences',
          occurrenceRow(scheduleId, { participant_id: otherParticipantId }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'schedule_occurrences_participant_fk',
        detail: expect.stringContaining(
          'is not present in table "participants"',
        ),
      });
    });

    it('refuses a participant from another team', async () => {
      const scheduleId = await newSchedule();
      await expect(
        insert(
          'schedule_occurrences',
          occurrenceRow(scheduleId, {
            participant_id: participantOf[TEAM_B],
          }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'schedule_occurrences_participant_fk',
      });
    });
  });

  describe('message_templates', () => {
    it.each([
      ['an unknown kind', { kind: 'postcard' }, 'message_templates_kind_check'],
      [
        'an unknown channel',
        { channel: 'fax' },
        'message_templates_channel_check',
      ],
      [
        'an email with no subject',
        { channel: 'email', subject: null },
        'message_templates_subject_check',
      ],
      [
        'an SMS carrying a subject',
        { channel: 'sms', subject: 'Hello' },
        'message_templates_subject_check',
      ],
      [
        'an unknown state',
        { state: 'archived' },
        'message_templates_state_check',
      ],
      ['a blank body', { body: '   ' }, 'message_templates_body_check'],
      [
        'a body past 8000 characters',
        { body: 'x'.repeat(8001) },
        'message_templates_body_check',
      ],
      [
        'a one-letter locale',
        { locale: 'e' },
        'message_templates_locale_check',
      ],
      ['a zeroth version', { version: 0 }, 'message_templates_locale_check'],
    ])('rejects %s', async (_label, overrides, constraint) => {
      await expect(
        insert('message_templates', templateRow(overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('accepts an SMS template with no subject', async () => {
      await expect(
        insert(
          'message_templates',
          templateRow({ channel: 'sms', subject: null }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('lets a team default collide with itself', async () => {
      const identity = {
        kind: 'reminder',
        channel: 'email',
        locale: 'en-GB',
        version: 1,
        study_id: null,
      };
      await newTemplate(identity);

      // NULLS NOT DISTINCT is the whole point: with ordinary NULL semantics
      // this second team-level default would be admitted and the resolver
      // would pick between them arbitrarily.
      await expect(
        insert('message_templates', templateRow(identity)),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: 'message_templates_identity_key',
      });

      // A study override of the same key is a different template.
      await expect(
        insert(
          'message_templates',
          templateRow({ ...identity, study_id: studyOf[TEAM_A] }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses a study override from another team', async () => {
      await expect(
        insert('message_templates', templateRow({ study_id: studyOf[TEAM_B] })),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'message_templates_study_fk',
        detail: expect.stringContaining('is not present in table "studies"'),
      });
    });

    it('holds a published template immutable', async () => {
      const templateId = await newTemplate({ state: 'published' });

      for (const assignment of [
        `body = 'Rewritten'`,
        `subject = 'Rewritten'`,
        `kind = 'reminder'`,
        `locale = 'fr-FR'`,
        `version = 2`,
        // The scope is cited too: moved between the team default and a
        // study, the template would no longer apply where its deliveries went.
        `study_id = '${studyOf[TEAM_A]}'`,
      ]) {
        await expect(
          pool.query(
            `UPDATE message_templates SET ${assignment} WHERE id = $1`,
            [templateId],
          ),
        ).rejects.toThrow('published message templates are immutable');
      }

      // Retiring a published template is the one transition it still allows:
      // the guard protects the content, not the lifecycle.
      await expect(
        pool.query(
          `UPDATE message_templates SET state = 'retired' WHERE id = $1`,
          [templateId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('never returns a published template to draft', async () => {
      const templateId = await newTemplate();
      // Back to draft would reopen the body for rewording under the same id
      // and version, which existing deliveries cite as evidence.
      await expect(
        pool.query(
          `UPDATE message_templates SET state = 'draft' WHERE id = $1`,
          [templateId],
        ),
      ).rejects.toThrow('published message templates are immutable');
      await expect(
        pool.query(
          `UPDATE message_templates SET state = 'retired' WHERE id = $1`,
          [templateId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('never revives a retired template', async () => {
      // Retirement is one-way too: revived, the template would satisfy
      // message_deliveries_template_applies again after its replacement.
      const templateId = await newTemplate({ state: 'retired' });
      for (const state of ['published', 'draft']) {
        await expect(
          pool.query(`UPDATE message_templates SET state = $2 WHERE id = $1`, [
            templateId,
            state,
          ]),
        ).rejects.toThrow('published message templates are immutable');
      }
    });

    it('leaves a draft template fully editable', async () => {
      const templateId = await newTemplate({ state: 'draft' });

      await expect(
        pool.query(
          `UPDATE message_templates SET body = 'Reworded', state = 'published'
           WHERE id = $1`,
          [templateId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe('message_deliveries', () => {
    it('applies the lease and attempt defaults', async () => {
      const deliveryId = await newDelivery();

      const row = await pool.query<Row>(
        `SELECT attempt_count, lease_owner, lease_expires_at, sent_at,
                failed_at, suppressed_at, uncertain_at, provider,
                provider_message_id, last_error
         FROM message_deliveries WHERE id = $1`,
        [deliveryId],
      );
      expect(row.rows[0]).toEqual({
        attempt_count: 0,
        lease_owner: null,
        lease_expires_at: null,
        sent_at: null,
        failed_at: null,
        suppressed_at: null,
        uncertain_at: null,
        provider: null,
        provider_message_id: null,
        last_error: null,
      });
    });

    it.each([
      [
        'an unknown kind',
        { kind: 'telegram' },
        'message_deliveries_kind_check',
      ],
      [
        'an unknown channel',
        { channel: 'fax' },
        'message_deliveries_channel_check',
      ],
      [
        'an unknown provider',
        { provider: 'carrier_pigeon' },
        'message_deliveries_provider_check',
      ],
      [
        'a negative attempt count',
        { attempt_count: -1 },
        'message_deliveries_attempt_count_check',
      ],
      [
        'a body hash that is not a sha256 digest',
        { rendered_body_hash: 'not-a-digest' },
        'message_deliveries_hash_check',
      ],
      [
        'a blind index that is not a sha256 digest',
        { recipient_blind_index: 'ABC' },
        'message_deliveries_hash_check',
      ],
      [
        'a lease owner with no expiry',
        { lease_owner: randomUUID() },
        'message_deliveries_lease_check',
      ],
      [
        'a lease expiry with no owner',
        { lease_expires_at: new Date() },
        'message_deliveries_lease_check',
      ],
      [
        'two terminal timestamps at once',
        { sent_at: new Date(), failed_at: new Date() },
        'message_deliveries_terminal_state_check',
      ],
      [
        'a terminal delivery still holding its lease',
        {
          sent_at: new Date(),
          lease_owner: randomUUID(),
          lease_expires_at: new Date(),
        },
        'message_deliveries_terminal_state_check',
      ],
      [
        'an error past 1000 characters',
        { last_error: 'x'.repeat(1001) },
        'message_deliveries_lengths_check',
      ],
      [
        'a blank provider message id',
        { provider_message_id: '' },
        'message_deliveries_lengths_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      const templateId = await newTemplate();
      await expect(
        insert('message_deliveries', deliveryRow(templateId, overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('accepts a held lease and a single terminal timestamp', async () => {
      const templateId = await newTemplate();
      await expect(
        insert(
          'message_deliveries',
          deliveryRow(templateId, {
            attempt_count: 2,
            lease_owner: randomUUID(),
            lease_expires_at: new Date('2026-09-10T18:05:00Z'),
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        insert(
          'message_deliveries',
          deliveryRow(templateId, {
            provider: 'postmark',
            provider_message_id: 'pm-1',
            sent_at: new Date(),
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('admits one delivery per occurrence per channel', async () => {
      const scheduleId = await newSchedule();
      const occurrenceId = await newOccurrence(scheduleId);
      const templateId = await newTemplate();
      const smsTemplateId = await newTemplate({
        channel: 'sms',
        subject: null,
      });

      await insert(
        'message_deliveries',
        deliveryRow(templateId, { occurrence_id: occurrenceId }),
      );

      await expect(
        insert(
          'message_deliveries',
          deliveryRow(templateId, { occurrence_id: occurrenceId }),
        ),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: 'message_deliveries_occurrence_id_channel_idx',
      });

      // The other channel for the same occurrence is a different send.
      await expect(
        insert(
          'message_deliveries',
          deliveryRow(smsTemplateId, {
            occurrence_id: occurrenceId,
            channel: 'sms',
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      // And the partial predicate leaves unscheduled sends uncounted, so two
      // invitations on the same channel do not collide.
      await expect(
        insert('message_deliveries', deliveryRow(templateId)),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        insert('message_deliveries', deliveryRow(templateId)),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it.each([
      ['another study', () => otherParticipantId],
      ['another team', () => participantOf[TEAM_B]],
    ])('refuses a participant from %s', async (_label, participantId) => {
      const templateId = await newTemplate();
      await expect(
        insert(
          'message_deliveries',
          deliveryRow(templateId, { participant_id: participantId() }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'message_deliveries_participant_fk',
        detail: expect.stringContaining(
          'is not present in table "participants"',
        ),
      });
    });

    it('refuses a template from another team', async () => {
      const foreignTemplateId = await newTemplate({ team_id: TEAM_B });
      await expect(
        insert('message_deliveries', deliveryRow(foreignTemplateId)),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'message_deliveries_template_fk',
        detail: expect.stringContaining(
          'is not present in table "message_templates"',
        ),
      });
    });

    it('refuses an occurrence from another team', async () => {
      const foreignScheduleId = await newSchedule({
        team_id: TEAM_B,
        study_id: studyOf[TEAM_B],
      });
      const foreignOccurrenceId = await newOccurrence(foreignScheduleId, {
        team_id: TEAM_B,
        study_id: studyOf[TEAM_B],
        participant_id: participantOf[TEAM_B],
      });
      const templateId = await newTemplate();

      await expect(
        insert(
          'message_deliveries',
          deliveryRow(templateId, { occurrence_id: foreignOccurrenceId }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'message_deliveries_occurrence_fk',
        detail: expect.stringContaining(
          'is not present in table "schedule_occurrences"',
        ),
      });
    });

    it('holds the addressing and content identity immutable', async () => {
      const deliveryId = await newDelivery();
      const scheduleId = await newSchedule();
      const occurrenceId = await newOccurrence(scheduleId);

      for (const assignment of [
        `kind = 'reminder'`,
        `channel = 'sms'`,
        `recipient_blind_index = '${hex('someone-else')}'`,
        `rendered_body_hash = '${hex('a different body')}'`,
        `occurrence_id = '${occurrenceId}'`,
        `participant_id = '${otherParticipantId}'`,
      ]) {
        await expect(
          pool.query(
            `UPDATE message_deliveries SET ${assignment} WHERE id = $1`,
            [deliveryId],
          ),
        ).rejects.toThrow('message delivery payload is immutable');
      }
    });

    it('lets dispatch state move', async () => {
      const deliveryId = await newDelivery();

      await expect(
        pool.query(
          `UPDATE message_deliveries
           SET attempt_count = attempt_count + 1,
               lease_owner = $2, lease_expires_at = now() + interval '5 minutes'
           WHERE id = $1`,
          [deliveryId, randomUUID()],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      await expect(
        pool.query(
          `UPDATE message_deliveries
           SET lease_owner = NULL, lease_expires_at = NULL,
               provider = 'postmark', provider_message_id = 'pm-2',
               sent_at = now()
           WHERE id = $1`,
          [deliveryId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses an occurrence resolved for another participant', async () => {
      const occurrenceId = await newOccurrence(await newSchedule());
      // A second participant of the same study: the team-scoped key admitted
      // this before; the four-column key refuses it.
      const otherId = randomUUID();
      await insert('participants', {
        id: otherId,
        study_id: studyOf[TEAM_A],
        team_id: TEAM_A,
        participant_code: `P-${otherId.slice(0, 8)}`,
      });

      await expect(
        newDelivery({ occurrence_id: occurrenceId, participant_id: otherId }),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'message_deliveries_occurrence_fk',
      });
      await expect(
        newDelivery({ occurrence_id: occurrenceId }),
      ).resolves.toMatch(/^[0-9a-f-]{36}$/);
    });

    it('refuses a template of another kind, channel, study or state', async () => {
      const deliveryWith = (templateId: string) =>
        insert('message_deliveries', deliveryRow(templateId));
      const refused =
        'must be a published prompt template for the email channel, either the team default or its own study';

      await expect(
        deliveryWith(await newTemplate({ kind: 'reminder' })),
      ).rejects.toThrow(refused);
      await expect(
        deliveryWith(await newTemplate({ channel: 'sms', subject: null })),
      ).rejects.toThrow(refused);
      await expect(
        deliveryWith(await newTemplate({ study_id: otherStudyId })),
      ).rejects.toThrow(refused);
      // Unreviewed wording, and withdrawn wording: neither is what a
      // participant may be sent, however well the rest of the key matches.
      await expect(
        deliveryWith(await newTemplate({ state: 'draft' })),
      ).rejects.toThrow(refused);
      await expect(
        deliveryWith(await newTemplate({ state: 'retired' })),
      ).rejects.toThrow(refused);
      // The team default and the study's own override both apply.
      await expect(
        deliveryWith(await newTemplate({ study_id: studyOf[TEAM_A] })),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(deliveryWith(await newTemplate())).resolves.toMatchObject({
        rowCount: 1,
      });
    });

    it('reserves send-state changes for the maintenance dispatcher', async () => {
      const deliveryId = await newDelivery();

      // The application role enqueues inside its audited transaction …
      const templateId = await newTemplate();
      const enqueued = deliveryRow(templateId);
      const columns = Object.keys(enqueued);
      await expect(
        tenantA.query(
          `INSERT INTO message_deliveries (${columns.map((n) => `"${n}"`).join(', ')})
           VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
          Object.values(enqueued),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      // … and cannot advance it afterwards: the sidecar's REVOKE holds because
      // the broad access grant runs before every module sidecar.
      await expect(
        tenantA.query(
          `UPDATE message_deliveries SET attempt_count = 1 WHERE id = $1`,
          [deliveryId],
        ),
      ).rejects.toMatchObject({ code: '42501' });

      // The dispatcher is exactly the role that may.
      await expect(
        maintenance.query(
          `UPDATE message_deliveries SET attempt_count = 1 WHERE id = $1`,
          [deliveryId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('reserves deletion for an audited erasure or the retention path', async () => {
      const deliveryId = await newDelivery();
      const refused =
        'message deliveries are deleted only by an audited erasure or the maintenance retention path';

      // DELETE is a privilege the application role holds — participant
      // erasure runs as that role and the participant key does not cascade —
      // so the guard is a trigger, and an unmarked delete is refused by it.
      await expect(
        tenantA.query(`DELETE FROM message_deliveries WHERE id = $1`, [
          deliveryId,
        ]),
      ).rejects.toThrow(refused);

      // A marker naming somebody else authorizes nothing: it is proven
      // against the delivery's own participant.
      await expect(
        erasing(
          otherParticipantId,
          `DELETE FROM message_deliveries WHERE id = $1`,
          [deliveryId],
        ),
      ).rejects.toThrow(refused);

      await expect(
        erasing(
          participantOf[TEAM_A]!,
          `DELETE FROM message_deliveries WHERE id = $1`,
          [deliveryId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      // And the retention path needs no marker at all.
      const purgeable = await newDelivery();
      await expect(
        maintenance.query(`DELETE FROM message_deliveries WHERE id = $1`, [
          purgeable,
        ]),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe('message_delivery_events', () => {
    it.each([
      [
        'an unknown kind',
        { kind: 'opened' },
        'message_delivery_events_kind_check',
      ],
      [
        'an unknown provider',
        { provider: 'carrier_pigeon' },
        'message_delivery_events_provider_check',
      ],
      [
        'scalar detail',
        { detail: JSON.stringify(3) },
        'message_delivery_events_detail_object_check',
      ],
      [
        'a blank provider event id',
        { provider_event_id: '' },
        'message_delivery_events_provider_event_id_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      const deliveryId = await newAttemptedDelivery();
      await expect(
        insert('message_delivery_events', eventRow(deliveryId, overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('deduplicates a redelivered provider callback', async () => {
      const deliveryId = await newAttemptedDelivery();
      const providerEventId = `evt-${randomUUID()}`;

      await insert(
        'message_delivery_events',
        eventRow(deliveryId, { provider_event_id: providerEventId }),
      );
      await expect(
        insert(
          'message_delivery_events',
          eventRow(deliveryId, {
            provider_event_id: providerEventId,
            kind: 'bounced',
          }),
        ),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: DELIVERY_EVENT_IDENTITY_KEY,
      });

      // A genuinely different callback from the same provider still lands.
      await expect(
        insert('message_delivery_events', eventRow(deliveryId)),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses a delivery from another team', async () => {
      const deliveryId = await newAttemptedDelivery();
      await expect(
        insert(
          'message_delivery_events',
          eventRow(deliveryId, { team_id: TEAM_B }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'message_delivery_events_delivery_fk',
        detail: expect.stringContaining(
          'is not present in table "message_deliveries"',
        ),
      });
    });

    it('refuses a provider that did not send the delivery', async () => {
      const refused =
        'a delivery event must name the provider that sent its delivery';

      // An allowed provider name, a real delivery of the event's own team —
      // and still not the provider that made the send.
      const deliveryId = await newAttemptedDelivery();
      await expect(
        insert(
          'message_delivery_events',
          eventRow(deliveryId, { provider: 'twilio' }),
        ),
      ).rejects.toThrow(refused);

      // A delivery still waiting in the outbox has been sent by nobody, so no
      // callback about it can be genuine.
      const pendingId = await newDelivery();
      await expect(
        insert('message_delivery_events', eventRow(pendingId)),
      ).rejects.toThrow(refused);

      // The provider that did send it is admitted.
      const smsTemplateId = await newTemplate({
        channel: 'sms',
        subject: null,
      });
      const smsDelivery = deliveryRow(smsTemplateId, {
        channel: 'sms',
        provider: 'twilio',
      });
      await insert('message_deliveries', smsDelivery);
      await expect(
        insert(
          'message_delivery_events',
          eventRow(smsDelivery.id as string, { provider: 'twilio' }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('is append-only', async () => {
      const deliveryId = await newAttemptedDelivery();
      const row = eventRow(deliveryId);
      await insert('message_delivery_events', row);

      await expect(
        pool.query(
          `UPDATE message_delivery_events SET kind = 'bounced' WHERE id = $1`,
          [row.id],
        ),
      ).rejects.toThrow('message delivery payload is immutable');
      // Even a write that changes nothing meaningful is refused: the trigger
      // guards the row, not a column list.
      await expect(
        pool.query(
          `UPDATE message_delivery_events SET detail = '{"code":1}'::jsonb
           WHERE id = $1`,
          [row.id],
        ),
      ).rejects.toThrow('message delivery payload is immutable');
    });

    it('reserves deletion for an audited erasure or the retention path', async () => {
      const deliveryId = await newAttemptedDelivery();
      const row = eventRow(deliveryId);
      await insert('message_delivery_events', row);
      const refused =
        'message delivery events are deleted only by an audited erasure or the maintenance retention path';

      // Evidence an ordinary application-role write cannot destroy — and,
      // because the identity key would then admit the same provider event
      // again, cannot replace either.
      await expect(
        tenantA.query(`DELETE FROM message_delivery_events WHERE id = $1`, [
          row.id,
        ]),
      ).rejects.toThrow(refused);

      // An event carries no participant, so the marker is proven through the
      // delivery it describes — and one naming somebody else proves nothing.
      await expect(
        erasing(
          otherParticipantId,
          `DELETE FROM message_delivery_events WHERE id = $1`,
          [row.id],
        ),
      ).rejects.toThrow(refused);
      await expect(
        erasing(
          participantOf[TEAM_A]!,
          `DELETE FROM message_delivery_events WHERE id = $1`,
          [row.id],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      const purgeable = eventRow(deliveryId);
      await insert('message_delivery_events', purgeable);
      await expect(
        maintenance.query(`DELETE FROM message_delivery_events WHERE id = $1`, [
          purgeable.id,
        ]),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe('participant_contact_optouts', () => {
    it.each([
      [
        'an unknown channel',
        { channel: 'fax' },
        'participant_contact_optouts_channel_check',
      ],
      [
        'an unknown source',
        { source: 'guesswork' },
        'participant_contact_optouts_source_check',
      ],
      [
        'an address in the clear',
        { recipient_blind_index: 'someone@example.org' },
        'participant_contact_optouts_blind_index_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      await expect(
        insert('participant_contact_optouts', optoutRow(overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('holds one opt-out per team, channel and blind index', async () => {
      const blindIndex = hex('opted-out-recipient');
      await insert(
        'participant_contact_optouts',
        optoutRow({ recipient_blind_index: blindIndex }),
      );

      await expect(
        insert(
          'participant_contact_optouts',
          optoutRow({ recipient_blind_index: blindIndex, source: 'provider' }),
        ),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: 'participant_contact_optouts_pkey',
      });

      // The same address on the other channel is a separate decision …
      await expect(
        insert(
          'participant_contact_optouts',
          optoutRow({ recipient_blind_index: blindIndex, channel: 'sms' }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      // … and so is the same address in another team: opting out of one lab's
      // study has not consented away another's.
      await expect(
        insert(
          'participant_contact_optouts',
          optoutRow({
            recipient_blind_index: blindIndex,
            team_id: TEAM_B,
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });
});
