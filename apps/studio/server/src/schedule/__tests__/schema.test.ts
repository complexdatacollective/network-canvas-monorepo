// The scheduling and messaging module's database-enforced promises: the
// cross-field CHECKs that make a malformed recurrence grammar unrepresentable,
// the two triggers that refuse a time zone Postgres does not know, the
// idempotency keys on occurrences and deliveries, the immutability of a
// published template, of a delivery's addressing, and of a provider callback,
// and every composite foreign key's cross-team and cross-study refusal.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK, unique or foreign-key violation, the message for a trigger
// — so a guard that stopped firing cannot pass as "no error". `refusalOf`
// reads the literal 'no failure' in every field of an admitted statement, so a
// case that stops refusing fails on the value rather than passing vacuously.
import { createHash, randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { describe, expect } from 'vitest';

import {
  insertTeam,
  ownerAffected,
  ownerRows,
  refusalOf,
  TestDatabaseLive,
  testDb,
  erasing,
  maintenanceAffected,
  ownerInsert,
  tenantAffected,
} from '../../__tests__/support/database.ts';

const TEAM_A = 'schedule-team-a';
const TEAM_B = 'schedule-team-b';

type Team = typeof TEAM_A | typeof TEAM_B;

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

/** Per team: one study, one wave, one participant, all open. */
const studyOf: Record<Team, string> = {
  [TEAM_A]: randomUUID(),
  [TEAM_B]: randomUUID(),
};
const waveOf: Record<Team, string> = {
  [TEAM_A]: randomUUID(),
  [TEAM_B]: randomUUID(),
};
const participantOf: Record<Team, string> = {
  [TEAM_A]: randomUUID(),
  [TEAM_B]: randomUUID(),
};
/** A second study in team A, for the cross-study composite-FK oracles. */
const otherStudyId = randomUUID();
const otherParticipantId = randomUUID();

// ---- row builders ---------------------------------------------------------

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
  recipient_address: `recipient-${randomUUID()}@example.org`,
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
  recipient_address: `optout-${randomUUID()}@example.org`,
  source: 'participant_reply',
  ...overrides,
});

const newSchedule = (overrides: Row = {}) => {
  const row = scheduleRow(overrides);
  return Effect.as(ownerInsert('study_schedules', row), row.id as string);
};

const newOccurrence = (scheduleId: string, overrides: Row = {}) => {
  const row = occurrenceRow(scheduleId, overrides);
  return Effect.as(ownerInsert('schedule_occurrences', row), row.id as string);
};

const newTemplate = (overrides: Row = {}) => {
  const row = templateRow(overrides);
  return Effect.as(ownerInsert('message_templates', row), row.id as string);
};

const newDelivery = (overrides: Row = {}) =>
  Effect.gen(function* () {
    const row = deliveryRow(yield* newTemplate(), overrides);
    yield* ownerInsert('message_deliveries', row);
    return row.id as string;
  });

/**
 * A delivery the dispatcher has already handed to a provider. Every callback
 * fixture sits on one, because an event must name the provider that sent its
 * delivery and a delivery with no provider has been sent by nobody.
 */
const newAttemptedDelivery = (overrides: Row = {}) =>
  newDelivery({ provider: 'postmark', ...overrides });

/** Both teams with a study, a wave and a participant each, once for the file. */
const Fixtures = Layer.effectDiscard(
  Effect.gen(function* () {
    for (const teamId of [TEAM_A, TEAM_B] as const) {
      yield* insertTeam(teamId);
      yield* ownerInsert('studies', {
        id: studyOf[teamId],
        team_id: teamId,
        name: `${teamId} study`,
      });
      yield* ownerInsert('study_waves', {
        id: waveOf[teamId],
        study_id: studyOf[teamId],
        team_id: teamId,
        wave_number: 1,
      });
      yield* ownerInsert('participants', {
        id: participantOf[teamId],
        study_id: studyOf[teamId],
        team_id: teamId,
        participant_code: `P-${teamId}`,
      });
    }

    // A second team-A study, so a cross-study rejection is not also a
    // cross-team one: the three-column keys must catch it on study_id alone.
    yield* ownerInsert('studies', {
      id: otherStudyId,
      team_id: TEAM_A,
      name: 'second team-a study',
    });
    yield* ownerInsert('participants', {
      id: otherParticipantId,
      study_id: otherStudyId,
      team_id: TEAM_A,
      participant_code: 'P-other',
    });
  }),
).pipe(Layer.provideMerge(TestDatabaseLive));

type RejectionCase = readonly [
  label: string,
  overrides: Row,
  constraint: string,
];
type AcceptanceCase = readonly [label: string, overrides: Row];

describe.skipIf(!testDb)('schedule and messaging schema', () => {
  layer(Fixtures)('over a provisioned schema', (it) => {
    describe('study_schedules: the recurrence grammar', () => {
      it.effect('applies the documented defaults', () =>
        Effect.gen(function* () {
          const scheduleId = yield* newSchedule();

          const rows = yield* ownerRows(
            `SELECT state, anchor_offset_minutes, window_start_minute,
                    window_end_minute, days_of_week_mask, quiet_hours_start_minute,
                    quiet_hours_end_minute, max_prompts_per_day,
                    prompt_expiry_hours, catch_up_policy, fallback_time_zone,
                    settings
             FROM study_schedules WHERE id = $1`,
            [scheduleId],
          );
          expect(rows[0]).toEqual({
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
        }),
      );

      it.effect.each<RejectionCase>([
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
        // The driver cannot infer an element type for an empty JS array, so
        // the empty array goes as Postgres' own literal, which binds untyped
        // and is read as the column's text[].
        [
          'no channel at all',
          { channels: '{}' },
          'study_schedules_channels_check',
        ],
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
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert('study_schedules', scheduleRow(overrides)),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect.each<AcceptanceCase>([
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
      ])('accepts %s', ([_label, overrides]) =>
        Effect.gen(function* () {
          expect(
            yield* ownerInsert('study_schedules', scheduleRow(overrides)),
          ).toBe(1);
        }),
      );

      it.effect('accepts a wave-window anchor scoped to a wave', () =>
        Effect.gen(function* () {
          expect(
            yield* ownerInsert(
              'study_schedules',
              scheduleRow({
                anchor_kind: 'wave_window_start',
                wave_id: waveOf[TEAM_A],
              }),
            ),
          ).toBe(1);
        }),
      );

      it.effect('refuses a schedule whose team disagrees with its study', () =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert('study_schedules', scheduleRow({ team_id: TEAM_B })),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'study_schedules_study_fk',
            detail: expect.stringContaining(
              'is not present in table "studies"',
            ),
          });
        }),
      );

      it.effect('refuses a wave from another study', () =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert(
              'study_schedules',
              scheduleRow({ wave_id: waveOf[TEAM_B], study_id: otherStudyId }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'study_schedules_wave_fk',
            detail: expect.stringContaining(
              'is not present in table "study_waves"',
            ),
          });
        }),
      );
    });

    describe('the time-zone triggers', () => {
      it.effect('accepts a real IANA zone as a schedule fallback', () =>
        Effect.gen(function* () {
          expect(
            yield* ownerInsert(
              'study_schedules',
              scheduleRow({ fallback_time_zone: 'Pacific/Auckland' }),
            ),
          ).toBe(1);
        }),
      );

      it.effect('rejects a zone Postgres does not know', () =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert(
              'study_schedules',
              scheduleRow({ fallback_time_zone: 'Mars/Olympus_Mons' }),
            ),
          );
          expect(refused.message).toContain(
            'unknown IANA time zone: Mars/Olympus_Mons',
          );
        }),
      );

      it.effect('re-checks the schedule zone on update', () =>
        Effect.gen(function* () {
          const scheduleId = yield* newSchedule();
          const refused = yield* refusalOf(
            ownerAffected(
              `UPDATE study_schedules SET fallback_time_zone = 'Mars/Olympus_Mons'
               WHERE id = $1`,
              [scheduleId],
            ),
          );
          expect(refused.message).toContain(
            'unknown IANA time zone: Mars/Olympus_Mons',
          );
          expect(
            yield* ownerAffected(
              `UPDATE study_schedules SET fallback_time_zone = 'America/Sao_Paulo'
               WHERE id = $1`,
              [scheduleId],
            ),
          ).toBe(1);
        }),
      );

      it.effect('accepts a real IANA zone on a resolved occurrence', () =>
        Effect.gen(function* () {
          const scheduleId = yield* newSchedule();
          expect(
            yield* ownerInsert(
              'schedule_occurrences',
              occurrenceRow(scheduleId, { resolved_time_zone: 'Asia/Kolkata' }),
            ),
          ).toBe(1);
        }),
      );

      it.effect('rejects an unknown zone on a resolved occurrence', () =>
        Effect.gen(function* () {
          const scheduleId = yield* newSchedule();
          const refused = yield* refusalOf(
            ownerInsert(
              'schedule_occurrences',
              occurrenceRow(scheduleId, { resolved_time_zone: 'Middle/Earth' }),
            ),
          );
          expect(refused.message).toContain(
            'unknown IANA time zone: Middle/Earth',
          );
        }),
      );
    });

    describe('schedule_occurrences', () => {
      it.effect.each<RejectionCase>([
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
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const scheduleId = yield* newSchedule();
          const refused = yield* refusalOf(
            ownerInsert(
              'schedule_occurrences',
              occurrenceRow(scheduleId, overrides),
            ),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect(
        'makes re-resolution idempotent per participant and index',
        () =>
          Effect.gen(function* () {
            const scheduleId = yield* newSchedule();
            yield* newOccurrence(scheduleId, { occurrence_index: 1 });

            const refused = yield* refusalOf(
              ownerInsert(
                'schedule_occurrences',
                occurrenceRow(scheduleId, { occurrence_index: 1 }),
              ),
            );
            expect(refused).toMatchObject({
              state: '23505',
              constraint: OCCURRENCE_IDENTITY_KEY,
            });

            // A second index, and the same index for a different participant,
            // are both distinct draws rather than collisions.
            expect(
              yield* ownerInsert(
                'schedule_occurrences',
                occurrenceRow(scheduleId, { occurrence_index: 2 }),
              ),
            ).toBe(1);
          }),
      );

      it.effect('holds the draw immutable', () =>
        Effect.gen(function* () {
          const scheduleId = yield* newSchedule();
          const occurrenceId = yield* newOccurrence(scheduleId);
          const otherScheduleId = yield* newSchedule();
          const siblingId = randomUUID();
          yield* ownerInsert('participants', {
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
            const refused = yield* refusalOf(
              ownerAffected(
                `UPDATE schedule_occurrences SET ${assignment} WHERE id = $1`,
                [occurrenceId],
              ),
            );
            expect(refused.message).toContain(
              'schedule occurrence identity is immutable',
            );
          }
        }),
      );

      it.effect('lets re-resolution and the lifecycle move', () =>
        Effect.gen(function* () {
          const occurrenceId = yield* newOccurrence(yield* newSchedule());

          // A zone change or a DST transition re-resolves the same local
          // intent to another instant …
          expect(
            yield* ownerAffected(
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
          ).toBe(1);

          // … and the occurrence still runs through its own lifecycle.
          expect(
            yield* ownerAffected(
              `UPDATE schedule_occurrences SET state = 'dispatched' WHERE id = $1`,
              [occurrenceId],
            ),
          ).toBe(1);
        }),
      );

      it.effect('refuses a schedule from another study', () =>
        Effect.gen(function* () {
          const scheduleId = yield* newSchedule();
          const refused = yield* refusalOf(
            ownerInsert(
              'schedule_occurrences',
              occurrenceRow(scheduleId, {
                study_id: otherStudyId,
                participant_id: otherParticipantId,
              }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'schedule_occurrences_schedule_fk',
            detail: expect.stringContaining(
              'is not present in table "study_schedules"',
            ),
          });
        }),
      );

      it.effect('refuses a participant from another study', () =>
        Effect.gen(function* () {
          const scheduleId = yield* newSchedule();
          const refused = yield* refusalOf(
            ownerInsert(
              'schedule_occurrences',
              occurrenceRow(scheduleId, { participant_id: otherParticipantId }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'schedule_occurrences_participant_fk',
            detail: expect.stringContaining(
              'is not present in table "participants"',
            ),
          });
        }),
      );

      it.effect('refuses a participant from another team', () =>
        Effect.gen(function* () {
          const scheduleId = yield* newSchedule();
          const refused = yield* refusalOf(
            ownerInsert(
              'schedule_occurrences',
              occurrenceRow(scheduleId, {
                participant_id: participantOf[TEAM_B],
              }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'schedule_occurrences_participant_fk',
          });
        }),
      );
    });

    describe('message_templates', () => {
      it.effect.each<RejectionCase>([
        [
          'an unknown kind',
          { kind: 'postcard' },
          'message_templates_kind_check',
        ],
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
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert('message_templates', templateRow(overrides)),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect('accepts an SMS template with no subject', () =>
        Effect.gen(function* () {
          expect(
            yield* ownerInsert(
              'message_templates',
              templateRow({ channel: 'sms', subject: null }),
            ),
          ).toBe(1);
        }),
      );

      it.effect('lets a team default collide with itself', () =>
        Effect.gen(function* () {
          const identity = {
            kind: 'reminder',
            channel: 'email',
            locale: 'en-GB',
            version: 1,
            study_id: null,
          };
          yield* newTemplate(identity);

          // NULLS NOT DISTINCT is the whole point: with ordinary NULL
          // semantics this second team-level default would be admitted and
          // the resolver would pick between them arbitrarily.
          const refused = yield* refusalOf(
            ownerInsert('message_templates', templateRow(identity)),
          );
          expect(refused).toMatchObject({
            state: '23505',
            constraint: 'message_templates_identity_key',
          });

          // A study override of the same key is a different template.
          expect(
            yield* ownerInsert(
              'message_templates',
              templateRow({ ...identity, study_id: studyOf[TEAM_A] }),
            ),
          ).toBe(1);
        }),
      );

      it.effect('refuses a study override from another team', () =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert(
              'message_templates',
              templateRow({ study_id: studyOf[TEAM_B] }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'message_templates_study_fk',
            detail: expect.stringContaining(
              'is not present in table "studies"',
            ),
          });
        }),
      );

      it.effect('holds a published template immutable', () =>
        Effect.gen(function* () {
          const templateId = yield* newTemplate({ state: 'published' });

          for (const assignment of [
            `body = 'Rewritten'`,
            `subject = 'Rewritten'`,
            `kind = 'reminder'`,
            `locale = 'fr-FR'`,
            `version = 2`,
            // The scope is cited too: moved between the team default and a
            // study, the template would no longer apply where its deliveries
            // went.
            `study_id = '${studyOf[TEAM_A]}'`,
          ]) {
            const refused = yield* refusalOf(
              ownerAffected(
                `UPDATE message_templates SET ${assignment} WHERE id = $1`,
                [templateId],
              ),
            );
            expect(refused.message).toContain(
              'published message templates are immutable',
            );
          }

          // Retiring a published template is the one transition it still
          // allows: the guard protects the content, not the lifecycle.
          expect(
            yield* ownerAffected(
              `UPDATE message_templates SET state = 'retired' WHERE id = $1`,
              [templateId],
            ),
          ).toBe(1);
        }),
      );

      it.effect('never returns a published template to draft', () =>
        Effect.gen(function* () {
          const templateId = yield* newTemplate();
          // Back to draft would reopen the body for rewording under the same
          // id and version, which existing deliveries cite as evidence.
          const refused = yield* refusalOf(
            ownerAffected(
              `UPDATE message_templates SET state = 'draft' WHERE id = $1`,
              [templateId],
            ),
          );
          expect(refused.message).toContain(
            'published message templates are immutable',
          );
          expect(
            yield* ownerAffected(
              `UPDATE message_templates SET state = 'retired' WHERE id = $1`,
              [templateId],
            ),
          ).toBe(1);
        }),
      );

      it.effect('never revives a retired template', () =>
        Effect.gen(function* () {
          // Retirement is one-way too: revived, the template would satisfy
          // message_deliveries_template_applies again after its replacement.
          const templateId = yield* newTemplate({ state: 'retired' });
          for (const state of ['published', 'draft']) {
            const refused = yield* refusalOf(
              ownerAffected(
                `UPDATE message_templates SET state = $2 WHERE id = $1`,
                [templateId, state],
              ),
            );
            expect(refused.message).toContain(
              'published message templates are immutable',
            );
          }
        }),
      );

      it.effect('leaves a draft template fully editable', () =>
        Effect.gen(function* () {
          const templateId = yield* newTemplate({ state: 'draft' });

          expect(
            yield* ownerAffected(
              `UPDATE message_templates SET body = 'Reworded', state = 'published'
               WHERE id = $1`,
              [templateId],
            ),
          ).toBe(1);
        }),
      );
    });

    describe('message_deliveries', () => {
      it.effect('applies the attempt and terminal-state defaults', () =>
        Effect.gen(function* () {
          const deliveryId = yield* newDelivery();

          const rows = yield* ownerRows(
            `SELECT attempt_count, sent_at, failed_at, suppressed_at,
                    uncertain_at, provider, provider_message_id, last_error
             FROM message_deliveries WHERE id = $1`,
            [deliveryId],
          );
          expect(rows[0]).toEqual({
            attempt_count: 0,
            sent_at: null,
            failed_at: null,
            suppressed_at: null,
            uncertain_at: null,
            provider: null,
            provider_message_id: null,
            last_error: null,
          });
        }),
      );

      it.effect.each<RejectionCase>([
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
          'an address shorter than 3 characters',
          { recipient_address: 'a@' },
          'message_deliveries_lengths_check',
        ],
        [
          'an address longer than 320 characters',
          { recipient_address: `${'a'.repeat(315)}@e.org` },
          'message_deliveries_lengths_check',
        ],
        [
          'two terminal timestamps at once',
          { sent_at: new Date(), failed_at: new Date() },
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
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const templateId = yield* newTemplate();
          const refused = yield* refusalOf(
            ownerInsert(
              'message_deliveries',
              deliveryRow(templateId, overrides),
            ),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect(
        'accepts a retried delivery and a single terminal timestamp',
        () =>
          Effect.gen(function* () {
            const templateId = yield* newTemplate();
            expect(
              yield* ownerInsert(
                'message_deliveries',
                deliveryRow(templateId, { attempt_count: 2 }),
              ),
            ).toBe(1);
            expect(
              yield* ownerInsert(
                'message_deliveries',
                deliveryRow(templateId, {
                  provider: 'postmark',
                  provider_message_id: 'pm-1',
                  sent_at: new Date(),
                }),
              ),
            ).toBe(1);
          }),
      );

      it.effect('admits one delivery per occurrence per channel', () =>
        Effect.gen(function* () {
          const scheduleId = yield* newSchedule();
          const occurrenceId = yield* newOccurrence(scheduleId);
          const templateId = yield* newTemplate();
          const smsTemplateId = yield* newTemplate({
            channel: 'sms',
            subject: null,
          });

          yield* ownerInsert(
            'message_deliveries',
            deliveryRow(templateId, { occurrence_id: occurrenceId }),
          );

          const refused = yield* refusalOf(
            ownerInsert(
              'message_deliveries',
              deliveryRow(templateId, { occurrence_id: occurrenceId }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23505',
            constraint: 'message_deliveries_occurrence_id_channel_idx',
          });

          // The other channel for the same occurrence is a different send.
          expect(
            yield* ownerInsert(
              'message_deliveries',
              deliveryRow(smsTemplateId, {
                occurrence_id: occurrenceId,
                channel: 'sms',
              }),
            ),
          ).toBe(1);

          // And the partial predicate leaves unscheduled sends uncounted, so
          // two invitations on the same channel do not collide.
          expect(
            yield* ownerInsert('message_deliveries', deliveryRow(templateId)),
          ).toBe(1);
          expect(
            yield* ownerInsert('message_deliveries', deliveryRow(templateId)),
          ).toBe(1);
        }),
      );

      it.effect.each<readonly [label: string, participantId: string]>([
        ['another study', otherParticipantId],
        ['another team', participantOf[TEAM_B]],
      ])('refuses a participant from %s', ([_label, participantId]) =>
        Effect.gen(function* () {
          const templateId = yield* newTemplate();
          const refused = yield* refusalOf(
            ownerInsert(
              'message_deliveries',
              deliveryRow(templateId, { participant_id: participantId }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'message_deliveries_participant_fk',
            detail: expect.stringContaining(
              'is not present in table "participants"',
            ),
          });
        }),
      );

      it.effect('refuses a template from another team', () =>
        Effect.gen(function* () {
          const foreignTemplateId = yield* newTemplate({ team_id: TEAM_B });
          const refused = yield* refusalOf(
            ownerInsert('message_deliveries', deliveryRow(foreignTemplateId)),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'message_deliveries_template_fk',
            detail: expect.stringContaining(
              'is not present in table "message_templates"',
            ),
          });
        }),
      );

      it.effect('refuses an occurrence from another team', () =>
        Effect.gen(function* () {
          const foreignScheduleId = yield* newSchedule({
            team_id: TEAM_B,
            study_id: studyOf[TEAM_B],
          });
          const foreignOccurrenceId = yield* newOccurrence(foreignScheduleId, {
            team_id: TEAM_B,
            study_id: studyOf[TEAM_B],
            participant_id: participantOf[TEAM_B],
          });
          const templateId = yield* newTemplate();

          const refused = yield* refusalOf(
            ownerInsert(
              'message_deliveries',
              deliveryRow(templateId, { occurrence_id: foreignOccurrenceId }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'message_deliveries_occurrence_fk',
            detail: expect.stringContaining(
              'is not present in table "schedule_occurrences"',
            ),
          });
        }),
      );

      it.effect('holds the addressing and content identity immutable', () =>
        Effect.gen(function* () {
          const deliveryId = yield* newDelivery();
          const scheduleId = yield* newSchedule();
          const occurrenceId = yield* newOccurrence(scheduleId);

          for (const assignment of [
            `kind = 'reminder'`,
            `channel = 'sms'`,
            `recipient_address = 'someone-else@example.org'`,
            `rendered_body_hash = '${hex('a different body')}'`,
            `occurrence_id = '${occurrenceId}'`,
            `participant_id = '${otherParticipantId}'`,
          ]) {
            const refused = yield* refusalOf(
              ownerAffected(
                `UPDATE message_deliveries SET ${assignment} WHERE id = $1`,
                [deliveryId],
              ),
            );
            expect(refused.message).toContain(
              'message delivery payload is immutable',
            );
          }
        }),
      );

      it.effect('lets send state move', () =>
        Effect.gen(function* () {
          const deliveryId = yield* newDelivery();

          expect(
            yield* ownerAffected(
              `UPDATE message_deliveries
               SET attempt_count = attempt_count + 1,
                   last_error = 'provider timed out'
               WHERE id = $1`,
              [deliveryId],
            ),
          ).toBe(1);

          expect(
            yield* ownerAffected(
              `UPDATE message_deliveries
               SET provider = 'postmark', provider_message_id = 'pm-2',
                   sent_at = now(), last_error = NULL
               WHERE id = $1`,
              [deliveryId],
            ),
          ).toBe(1);
        }),
      );

      it.effect('refuses an occurrence resolved for another participant', () =>
        Effect.gen(function* () {
          const occurrenceId = yield* newOccurrence(yield* newSchedule());
          // A second participant of the same study: the team-scoped key
          // admitted this before; the four-column key refuses it.
          const otherId = randomUUID();
          yield* ownerInsert('participants', {
            id: otherId,
            study_id: studyOf[TEAM_A],
            team_id: TEAM_A,
            participant_code: `P-${otherId.slice(0, 8)}`,
          });

          const refused = yield* refusalOf(
            newDelivery({
              occurrence_id: occurrenceId,
              participant_id: otherId,
            }),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'message_deliveries_occurrence_fk',
          });
          expect(yield* newDelivery({ occurrence_id: occurrenceId })).toMatch(
            /^[0-9a-f-]{36}$/,
          );
        }),
      );

      it.effect(
        'refuses a template of another kind, channel, study or state',
        () =>
          Effect.gen(function* () {
            const deliveryWith = (templateId: string) =>
              ownerInsert('message_deliveries', deliveryRow(templateId));
            const refusedBy =
              'must be a published prompt template for the email channel, either the team default or its own study';
            const refusal = (templateId: string) =>
              Effect.map(
                refusalOf(deliveryWith(templateId)),
                (refused) => refused.message,
              );

            expect(
              yield* refusal(yield* newTemplate({ kind: 'reminder' })),
            ).toContain(refusedBy);
            expect(
              yield* refusal(
                yield* newTemplate({ channel: 'sms', subject: null }),
              ),
            ).toContain(refusedBy);
            expect(
              yield* refusal(yield* newTemplate({ study_id: otherStudyId })),
            ).toContain(refusedBy);
            // Unreviewed wording, and withdrawn wording: neither is what a
            // participant may be sent, however well the rest of the key matches.
            expect(
              yield* refusal(yield* newTemplate({ state: 'draft' })),
            ).toContain(refusedBy);
            expect(
              yield* refusal(yield* newTemplate({ state: 'retired' })),
            ).toContain(refusedBy);
            // The team default and the study's own override both apply.
            expect(
              yield* deliveryWith(
                yield* newTemplate({ study_id: studyOf[TEAM_A] }),
              ),
            ).toBe(1);
            expect(yield* deliveryWith(yield* newTemplate())).toBe(1);
          }),
      );

      it.effect(
        'reserves send-state changes for the maintenance dispatcher',
        () =>
          Effect.gen(function* () {
            const deliveryId = yield* newDelivery();

            // The application role enqueues inside its audited transaction …
            const templateId = yield* newTemplate();
            const enqueued = deliveryRow(templateId);
            const columns = Object.keys(enqueued);
            expect(
              yield* tenantAffected(
                TEAM_A,
                `INSERT INTO message_deliveries (${columns.map((n) => `"${n}"`).join(', ')})
               VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
                Object.values(enqueued),
              ),
            ).toBe(1);

            // … and cannot advance it afterwards: the sidecar's REVOKE holds
            // because the broad access grant runs before every module sidecar.
            const refused = yield* refusalOf(
              tenantAffected(
                TEAM_A,
                `UPDATE message_deliveries SET attempt_count = 1 WHERE id = $1`,
                [deliveryId],
              ),
            );
            expect(refused.state).toBe('42501');

            // The dispatcher is exactly the role that may.
            expect(
              yield* maintenanceAffected(
                `UPDATE message_deliveries SET attempt_count = 1 WHERE id = $1`,
                [deliveryId],
              ),
            ).toBe(1);
          }),
      );

      it.effect(
        'reserves deletion for an audited erasure or the retention path',
        () =>
          Effect.gen(function* () {
            const deliveryId = yield* newDelivery();
            const refusedBy =
              'message deliveries are deleted only by an audited erasure or the maintenance retention path';

            // DELETE is a privilege the application role holds — participant
            // erasure runs as that role and the participant key does not
            // cascade — so the guard is a trigger, and an unmarked delete is
            // refused by it.
            const unmarked = yield* refusalOf(
              tenantAffected(
                TEAM_A,
                `DELETE FROM message_deliveries WHERE id = $1`,
                [deliveryId],
              ),
            );
            expect(unmarked.message).toContain(refusedBy);

            // A marker naming somebody else authorizes nothing: it is proven
            // against the delivery's own participant.
            const misnamed = yield* refusalOf(
              erasing(
                TEAM_A,
                otherParticipantId,
                `DELETE FROM message_deliveries WHERE id = $1`,
                [deliveryId],
              ),
            );
            expect(misnamed.message).toContain(refusedBy);

            expect(
              yield* erasing(
                TEAM_A,
                participantOf[TEAM_A],
                `DELETE FROM message_deliveries WHERE id = $1`,
                [deliveryId],
              ),
            ).toBe(1);

            // And the retention path needs no marker at all.
            const purgeable = yield* newDelivery();
            expect(
              yield* maintenanceAffected(
                `DELETE FROM message_deliveries WHERE id = $1`,
                [purgeable],
              ),
            ).toBe(1);
          }),
      );
    });

    describe('message_delivery_events', () => {
      it.effect.each<RejectionCase>([
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
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const deliveryId = yield* newAttemptedDelivery();
          const refused = yield* refusalOf(
            ownerInsert(
              'message_delivery_events',
              eventRow(deliveryId, overrides),
            ),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect('deduplicates a redelivered provider callback', () =>
        Effect.gen(function* () {
          const deliveryId = yield* newAttemptedDelivery();
          const providerEventId = `evt-${randomUUID()}`;

          yield* ownerInsert(
            'message_delivery_events',
            eventRow(deliveryId, { provider_event_id: providerEventId }),
          );
          const refused = yield* refusalOf(
            ownerInsert(
              'message_delivery_events',
              eventRow(deliveryId, {
                provider_event_id: providerEventId,
                kind: 'bounced',
              }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23505',
            constraint: DELIVERY_EVENT_IDENTITY_KEY,
          });

          // A genuinely different callback from the same provider still lands.
          expect(
            yield* ownerInsert('message_delivery_events', eventRow(deliveryId)),
          ).toBe(1);
        }),
      );

      it.effect('refuses a delivery from another team', () =>
        Effect.gen(function* () {
          const deliveryId = yield* newAttemptedDelivery();
          const refused = yield* refusalOf(
            ownerInsert(
              'message_delivery_events',
              eventRow(deliveryId, { team_id: TEAM_B }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'message_delivery_events_delivery_fk',
            detail: expect.stringContaining(
              'is not present in table "message_deliveries"',
            ),
          });
        }),
      );

      it.effect('refuses a provider that did not send the delivery', () =>
        Effect.gen(function* () {
          const refusedBy =
            'a delivery event must name the provider that sent its delivery';

          // An allowed provider name, a real delivery of the event's own team
          // — and still not the provider that made the send.
          const deliveryId = yield* newAttemptedDelivery();
          const wrongProvider = yield* refusalOf(
            ownerInsert(
              'message_delivery_events',
              eventRow(deliveryId, { provider: 'twilio' }),
            ),
          );
          expect(wrongProvider.message).toContain(refusedBy);

          // A delivery still waiting in the outbox has been sent by nobody, so
          // no callback about it can be genuine.
          const pendingId = yield* newDelivery();
          const unsent = yield* refusalOf(
            ownerInsert('message_delivery_events', eventRow(pendingId)),
          );
          expect(unsent.message).toContain(refusedBy);

          // The provider that did send it is admitted.
          const smsTemplateId = yield* newTemplate({
            channel: 'sms',
            subject: null,
          });
          const smsDelivery = deliveryRow(smsTemplateId, {
            channel: 'sms',
            provider: 'twilio',
          });
          yield* ownerInsert('message_deliveries', smsDelivery);
          expect(
            yield* ownerInsert(
              'message_delivery_events',
              eventRow(smsDelivery.id as string, { provider: 'twilio' }),
            ),
          ).toBe(1);
        }),
      );

      it.effect('is append-only', () =>
        Effect.gen(function* () {
          const deliveryId = yield* newAttemptedDelivery();
          const row = eventRow(deliveryId);
          yield* ownerInsert('message_delivery_events', row);

          const rewritten = yield* refusalOf(
            ownerAffected(
              `UPDATE message_delivery_events SET kind = 'bounced' WHERE id = $1`,
              [row.id],
            ),
          );
          expect(rewritten.message).toContain(
            'message delivery payload is immutable',
          );
          // Even a write that changes nothing meaningful is refused: the
          // trigger guards the row, not a column list.
          const annotated = yield* refusalOf(
            ownerAffected(
              `UPDATE message_delivery_events SET detail = '{"code":1}'::jsonb
               WHERE id = $1`,
              [row.id],
            ),
          );
          expect(annotated.message).toContain(
            'message delivery payload is immutable',
          );
        }),
      );

      it.effect(
        'reserves deletion for an audited erasure or the retention path',
        () =>
          Effect.gen(function* () {
            const deliveryId = yield* newAttemptedDelivery();
            const row = eventRow(deliveryId);
            yield* ownerInsert('message_delivery_events', row);
            const refusedBy =
              'message delivery events are deleted only by an audited erasure or the maintenance retention path';

            // Evidence an ordinary application-role write cannot destroy — and,
            // because the identity key would then admit the same provider event
            // again, cannot replace either.
            const unmarked = yield* refusalOf(
              tenantAffected(
                TEAM_A,
                `DELETE FROM message_delivery_events WHERE id = $1`,
                [row.id],
              ),
            );
            expect(unmarked.message).toContain(refusedBy);

            // An event carries no participant, so the marker is proven through
            // the delivery it describes — and one naming somebody else proves
            // nothing.
            const misnamed = yield* refusalOf(
              erasing(
                TEAM_A,
                otherParticipantId,
                `DELETE FROM message_delivery_events WHERE id = $1`,
                [row.id],
              ),
            );
            expect(misnamed.message).toContain(refusedBy);
            expect(
              yield* erasing(
                TEAM_A,
                participantOf[TEAM_A],
                `DELETE FROM message_delivery_events WHERE id = $1`,
                [row.id],
              ),
            ).toBe(1);

            const purgeable = eventRow(deliveryId);
            yield* ownerInsert('message_delivery_events', purgeable);
            expect(
              yield* maintenanceAffected(
                `DELETE FROM message_delivery_events WHERE id = $1`,
                [purgeable.id],
              ),
            ).toBe(1);
          }),
      );
    });

    describe('participant_contact_optouts', () => {
      it.effect.each<RejectionCase>([
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
          'an address shorter than 3 characters',
          { recipient_address: 'a@' },
          'participant_contact_optouts_address_check',
        ],
        [
          'an address longer than 320 characters',
          { recipient_address: `${'a'.repeat(315)}@e.org` },
          'participant_contact_optouts_address_check',
        ],
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert('participant_contact_optouts', optoutRow(overrides)),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect('holds one opt-out per team, channel and address', () =>
        Effect.gen(function* () {
          const address = 'opted-out-recipient@example.org';
          yield* ownerInsert(
            'participant_contact_optouts',
            optoutRow({ recipient_address: address }),
          );

          const refused = yield* refusalOf(
            ownerInsert(
              'participant_contact_optouts',
              optoutRow({ recipient_address: address, source: 'provider' }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23505',
            constraint: 'participant_contact_optouts_pkey',
          });

          // The same address on the other channel is a separate decision …
          expect(
            yield* ownerInsert(
              'participant_contact_optouts',
              optoutRow({ recipient_address: address, channel: 'sms' }),
            ),
          ).toBe(1);

          // … and so is the same address in another team: opting out of one
          // lab's study has not consented away another's.
          expect(
            yield* ownerInsert(
              'participant_contact_optouts',
              optoutRow({
                recipient_address: address,
                team_id: TEAM_B,
              }),
            ),
          ).toBe(1);
        }),
      );
    });
  });
});
