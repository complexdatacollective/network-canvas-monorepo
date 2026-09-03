// Scheduling and messaging: the schedule over a live study, the prompt
// instances it resolves to, the localized message bodies, the send outbox, the
// provider callbacks, and the suppression list.
//
// The occurrences are generated here rather than by the real resolver, because
// there is no resolver yet (#1304 defines the grammar; the implementation is
// still to come). What the seed does reproduce is the resolver's contract: an
// absolute `scheduled_for`, the participant-local intent it was computed from,
// and the zone it was resolved under — so the rows are the right shape for the
// resolver to take over.
import { faker } from '@faker-js/faker';
import type pg from 'pg';

import { insertRows, type SeedRowValue } from './insert.ts';
import {
  contactBlindIndex,
  seedHex,
  seedTime,
  seedUuid,
  sha256Hex,
  shiftDays,
  shiftMinutes,
} from './rng.ts';
import type { SeedParticipant, SeedStudy } from './studies.ts';
import type { SeedTeam } from './teams.ts';

const MESSAGE_KINDS = ['invitation', 'prompt', 'reminder', 'custom'] as const;
const CHANNELS = ['email', 'sms'] as const;
const RECURRENCE_KINDS = [
  'one_off',
  'fixed_interval',
  'random_sample',
] as const;
const ANCHOR_KINDS = ['enrolment', 'fixed_date', 'wave_window_start'] as const;

/** How many of a study's participants the schedule is resolved for. */
const SCHEDULED_PARTICIPANTS = 4;

const localFormatters = new Map<string, Intl.DateTimeFormat>();

function localParts(
  when: Date,
  timeZone: string,
): {
  date: string;
  minute: number;
} {
  let formatter = localFormatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    localFormatters.set(timeZone, formatter);
  }
  const parts = new Map(
    formatter.formatToParts(when).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`,
    minute: Number(parts.get('hour')) * 60 + Number(parts.get('minute')),
  };
}

export type SeededOccurrence = {
  id: string;
  studyId: string;
  participant: SeedParticipant;
  scheduledFor: Date;
  state: string;
};

type SeededSchedule = {
  id: string;
  studyId: string;
  waveId: string;
  promptExpiryHours: number;
  recurrenceKind: (typeof RECURRENCE_KINDS)[number];
};

/**
 * One schedule over each team's live managed study. The recurrence and anchor
 * kinds rotate by team, so all three recurrences and all three anchors appear
 * across the corpus.
 */
async function seedSchedule(
  client: pg.PoolClient,
  team: SeedTeam,
  study: SeedStudy,
): Promise<SeededSchedule> {
  const id = seedUuid();
  const wave = study.waves[0]!;
  const recurrenceKind =
    RECURRENCE_KINDS[team.index % RECURRENCE_KINDS.length]!;
  const anchorKind = ANCHOR_KINDS[team.index % ANCHOR_KINDS.length]!;
  const promptExpiryHours = faker.number.int({ min: 6, max: 48 });

  const fixedInterval = recurrenceKind === 'fixed_interval';
  const randomSample = recurrenceKind === 'random_sample';
  await client.query(
    `insert into study_schedules (
       id, team_id, study_id, wave_id, name, state,
       anchor_kind, anchor_date, anchor_offset_minutes,
       recurrence_kind, interval_days, samples_per_period, period_days,
       min_gap_minutes, occurrence_limit,
       window_start_minute, window_end_minute, days_of_week_mask,
       quiet_hours_start_minute, quiet_hours_end_minute, max_prompts_per_day,
       prompt_expiry_hours, catch_up_policy, fallback_time_zone, channels,
       settings, created_at, updated_at)
     values ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9, $10, $11, $12, $13,
             $14, $15, $16, $17, $18, $19, $20, $21, $22, 'UTC', $23, $24, $25, $25)`,
    [
      id,
      team.id,
      study.id,
      wave.id,
      `${study.name} prompts`,
      anchorKind,
      anchorKind === 'fixed_date' ? shiftDays(study.createdAt, 25) : null,
      faker.number.int({ min: -120, max: 120 }),
      recurrenceKind,
      fixedInterval ? faker.number.int({ min: 1, max: 7 }) : null,
      randomSample ? faker.number.int({ min: 2, max: 6 }) : null,
      randomSample ? 7 : null,
      randomSample ? faker.number.int({ min: 60, max: 240 }) : null,
      recurrenceKind === 'one_off'
        ? null
        : faker.number.int({ min: 20, max: 90 }),
      480,
      1_320,
      127,
      1_320,
      480,
      faker.number.int({ min: 1, max: 4 }),
      promptExpiryHours,
      faker.helpers.arrayElement(['skip', 'reschedule_within_period']),
      team.index % 2 === 0 ? ['email'] : ['email', 'sms'],
      JSON.stringify({ quietHoursRespectLocalHolidays: false }),
      shiftDays(study.createdAt, 16),
    ],
  );
  return {
    id,
    studyId: study.id,
    waveId: wave.id,
    promptExpiryHours,
    recurrenceKind,
  };
}

async function seedOccurrences(
  client: pg.PoolClient,
  team: SeedTeam,
  study: SeedStudy,
  schedule: SeededSchedule,
): Promise<SeededOccurrence[]> {
  const rows: SeedRowValue[][] = [];
  const occurrences: SeededOccurrence[] = [];

  // Only the head of the cohort gets a resolved run of prompts.
  // `schedule_occurrences_time_zone_known` proves every row's zone against
  // `pg_timezone_names`, which re-enumerates the whole tz database per row and
  // costs around four milliseconds: resolving the full cohort would add tens of
  // seconds to every `pnpm dev` boot for rows that show nothing new.
  const cohort = study.participants.slice(0, SCHEDULED_PARTICIPANTS);
  for (const participant of cohort) {
    // A one-off schedule resolves to exactly one prompt per participant; a
    // recurring one resolves to a run of them.
    const count =
      schedule.recurrenceKind === 'one_off'
        ? 1
        : faker.number.int({ min: 14, max: 60 });
    let cursor = shiftDays(participant.enrolledAt, 1);
    for (let index = 0; index < count; index++) {
      cursor = shiftMinutes(
        cursor,
        faker.number.int({ min: 20 * 60, max: 52 * 60 }),
      );
      const local = localParts(cursor, participant.timezone);
      // Past occurrences were dispatched or lapsed; the tail is still pending.
      const state =
        index < count - 4
          ? faker.helpers.arrayElement([
              'dispatched',
              'dispatched',
              'dispatched',
              'expired',
              'cancelled',
            ])
          : 'scheduled';
      const id = seedUuid();
      rows.push([
        id,
        team.id,
        study.id,
        schedule.id,
        participant.id,
        index + 1,
        cursor,
        local.date,
        local.minute,
        participant.timezone,
        shiftMinutes(cursor, schedule.promptExpiryHours * 60),
        state,
        shiftDays(participant.enrolledAt, 1),
      ]);
      occurrences.push({
        id,
        studyId: study.id,
        participant,
        scheduledFor: cursor,
        state,
      });
    }
  }

  await insertRows(
    client,
    'schedule_occurrences',
    [
      'id',
      'team_id',
      'study_id',
      'schedule_id',
      'participant_id',
      'occurrence_index',
      'scheduled_for',
      'scheduled_local_date',
      'scheduled_local_minute',
      'resolved_time_zone',
      'expires_at',
      'state',
      'created_at',
    ],
    rows,
  );
  return occurrences;
}

type SeededTemplate = { id: string; kind: string; channel: string };

/** Every kind on every channel at team level, plus one Spanish override. */
async function seedMessageTemplates(
  client: pg.PoolClient,
  team: SeedTeam,
): Promise<SeededTemplate[]> {
  const rows: SeedRowValue[][] = [];
  const templates: SeededTemplate[] = [];
  const createdAt = seedTime(-290 + team.index);

  const push = (kind: string, channel: string, locale: string) => {
    const id = seedUuid();
    rows.push([
      id,
      team.id,
      null,
      kind,
      channel,
      locale,
      1,
      'published',
      channel === 'email'
        ? `${kind === 'invitation' ? 'You are invited' : 'A short check-in'} — {{studyName}}`
        : null,
      `${faker.lorem.sentence()} {{interviewLink}}`,
      createdAt,
      createdAt,
    ]);
    templates.push({ id, kind, channel });
  };

  for (const kind of MESSAGE_KINDS) {
    for (const channel of CHANNELS) push(kind, channel, 'en');
  }
  push('prompt', 'email', 'es');

  await insertRows(
    client,
    'message_templates',
    [
      'id',
      'team_id',
      'study_id',
      'kind',
      'channel',
      'locale',
      'version',
      'state',
      'subject',
      'body',
      'created_at',
      'updated_at',
    ],
    rows,
  );
  return templates;
}

type DeliveryOutcome =
  | 'sent'
  | 'failed'
  | 'suppressed'
  | 'uncertain'
  | 'pending';

function outcomeFor(index: number): DeliveryOutcome {
  const position = index % 20;
  if (position < 14) return 'sent';
  if (position < 16) return 'failed';
  if (position < 17) return 'uncertain';
  return 'pending';
}

/**
 * The send outbox, its provider callbacks, and the suppression list they agree
 * with: every delivery to an opted-out address is suppressed, and every
 * suppressed delivery's blind index has a matching opt-out row.
 */
async function seedDeliveries(
  client: pg.PoolClient,
  team: SeedTeam,
  study: SeedStudy,
  templates: SeededTemplate[],
  occurrences: SeededOccurrence[],
): Promise<void> {
  const optedOut = study.participants.slice(0, 2);
  const optOutIndexes = new Set(
    optedOut.map((participant) =>
      contactBlindIndex(participant.contactAddress),
    ),
  );

  const deliveryRows: SeedRowValue[][] = [];
  const eventRows: SeedRowValue[][] = [];
  const optOutRows: SeedRowValue[][] = [];

  for (const participant of optedOut) {
    for (const channel of CHANNELS) {
      optOutRows.push([
        team.id,
        channel,
        contactBlindIndex(participant.contactAddress),
        faker.helpers.arrayElement([
          'participant_reply',
          'provider',
          'researcher',
        ]),
        shiftDays(participant.enrolledAt, 20),
      ]);
    }
  }

  const templateFor = (kind: string, channel: string) =>
    templates.find(
      (template) => template.kind === kind && template.channel === channel,
    )!;

  let ordinal = 0;
  let bounces = 0;
  let complaints = 0;

  const enqueue = (input: {
    participant: SeedParticipant;
    occurrenceId: string | null;
    kind: string;
    channel: string;
    createdAt: Date;
  }) => {
    const blindIndex = contactBlindIndex(input.participant.contactAddress);
    const outcome: DeliveryOutcome = optOutIndexes.has(blindIndex)
      ? 'suppressed'
      : outcomeFor(ordinal++);
    const id = seedUuid();
    const terminalAt = shiftMinutes(
      input.createdAt,
      faker.number.int({ min: 1, max: 90 }),
    );
    const provider =
      outcome === 'pending'
        ? null
        : input.channel === 'email'
          ? 'postmark'
          : 'twilio';

    deliveryRows.push([
      id,
      team.id,
      study.id,
      input.participant.id,
      input.occurrenceId,
      templateFor(input.kind, input.channel).id,
      input.kind,
      input.channel,
      blindIndex,
      sha256Hex(`${id}:${input.kind}:${input.channel}`),
      provider,
      outcome === 'sent' ? `msg_${seedHex(8)}` : null,
      outcome === 'pending' ? 0 : faker.number.int({ min: 1, max: 3 }),
      input.createdAt,
      outcome === 'sent' ? terminalAt : null,
      outcome === 'failed' ? terminalAt : null,
      outcome === 'suppressed' ? terminalAt : null,
      outcome === 'uncertain' ? terminalAt : null,
      outcome === 'failed'
        ? 'provider rejected the recipient address'
        : outcome === 'uncertain'
          ? 'provider response was not conclusive'
          : null,
      input.createdAt,
    ]);

    if (outcome !== 'sent' || provider === null) return;
    const eventCount = faker.number.int({ min: 0, max: 2 });
    for (let event = 0; event < eventCount; event++) {
      // At least one bounce and one complaint exist in every team's corpus.
      const kind =
        bounces === 0
          ? 'bounced'
          : complaints === 0
            ? 'complained'
            : faker.helpers.arrayElement([
                'queued',
                'delivered',
                'delivered',
                'bounced',
                'complained',
                'failed',
              ]);
      if (kind === 'bounced') bounces++;
      if (kind === 'complained') complaints++;
      eventRows.push([
        seedUuid(),
        team.id,
        id,
        provider,
        `evt_${seedHex(10)}`,
        kind,
        shiftMinutes(terminalAt, event + 1),
        shiftMinutes(terminalAt, event + 2),
        JSON.stringify({ code: faker.number.int({ min: 200, max: 554 }) }),
      ]);
    }
  };

  // One invitation per participant, then the prompts their dispatched
  // occurrences produced.
  for (const participant of study.participants) {
    enqueue({
      participant,
      occurrenceId: null,
      kind: 'invitation',
      channel: 'email',
      createdAt: shiftDays(participant.enrolledAt, 1),
    });
  }
  const dispatched = occurrences.filter(
    (occurrence) => occurrence.state === 'dispatched',
  );
  const byParticipant = new Map<string, number>();
  for (const occurrence of dispatched) {
    const seen = byParticipant.get(occurrence.participant.id) ?? 0;
    if (seen >= 8) continue;
    byParticipant.set(occurrence.participant.id, seen + 1);
    enqueue({
      participant: occurrence.participant,
      occurrenceId: occurrence.id,
      kind: seen % 3 === 2 ? 'reminder' : 'prompt',
      channel: 'email',
      createdAt: occurrence.scheduledFor,
    });
  }

  await insertRows(
    client,
    'message_deliveries',
    [
      'id',
      'team_id',
      'study_id',
      'participant_id',
      'occurrence_id',
      'template_id',
      'kind',
      'channel',
      'recipient_blind_index',
      'rendered_body_hash',
      'provider',
      'provider_message_id',
      'attempt_count',
      'available_at',
      'sent_at',
      'failed_at',
      'suppressed_at',
      'uncertain_at',
      'last_error',
      'created_at',
    ],
    deliveryRows,
  );
  await insertRows(
    client,
    'message_delivery_events',
    [
      'id',
      'team_id',
      'delivery_id',
      'provider',
      'provider_event_id',
      'kind',
      'occurred_at',
      'received_at',
      'detail',
    ],
    eventRows,
  );
  await insertRows(
    client,
    'participant_contact_optouts',
    ['team_id', 'channel', 'recipient_blind_index', 'source', 'opted_out_at'],
    optOutRows,
  );
}

export async function seedScheduling(
  client: pg.PoolClient,
  team: SeedTeam,
  studies: SeedStudy[],
): Promise<void> {
  const templates = await seedMessageTemplates(client, team);
  const live = studies.find((study) => study.key === 'live');
  if (live === undefined) return;
  const schedule = await seedSchedule(client, team, live);
  const occurrences = await seedOccurrences(client, team, live, schedule);
  await seedDeliveries(client, team, live, templates, occurrences);
}
