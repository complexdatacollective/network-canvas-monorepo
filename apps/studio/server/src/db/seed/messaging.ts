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
  anchorKind: (typeof ANCHOR_KINDS)[number];
  anchorDate: Date | null;
  anchorOffsetMinutes: number;
  intervalDays: number | null;
  samplesPerPeriod: number | null;
  periodDays: number | null;
  occurrenceLimit: number | null;
  windowStartMinute: number;
  windowEndMinute: number;
  createdAt: Date;
};

/** How far past its anchor a schedule is resolved for each participant. */
const RESOLUTION_HORIZON_DAYS = 400;

/** `YYYY-MM-DD` plus `days`, in calendar arithmetic. */
function shiftLocalDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The instant at which `timeZone` reads `date` at `minute` past midnight —
 * the inverse of `localParts`. Two corrections converge across a DST change,
 * where the first guess lands an hour off.
 */
function instantFor(date: string, minute: number, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wanted = Date.UTC(y, m - 1, d) / 60_000 + minute;
  let instant = new Date(wanted * 60_000);
  for (let pass = 0; pass < 2; pass++) {
    const local = localParts(instant, timeZone);
    const [ly, lm, ld] = local.date.split('-').map(Number) as [
      number,
      number,
      number,
    ];
    const got = Date.UTC(ly, lm - 1, ld) / 60_000 + local.minute;
    instant = new Date(instant.getTime() + (wanted - got) * 60_000);
  }
  return instant;
}

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
  // The grammar the occurrences below are resolved from, kept beside the row
  // so the resolution and the stored schedule cannot disagree.
  const plan: SeededSchedule = {
    id,
    studyId: study.id,
    waveId: wave.id,
    promptExpiryHours,
    recurrenceKind,
    anchorKind,
    anchorDate:
      anchorKind === 'fixed_date' ? shiftDays(study.createdAt, 25) : null,
    anchorOffsetMinutes: faker.number.int({ min: -120, max: 120 }),
    intervalDays: fixedInterval ? faker.number.int({ min: 1, max: 7 }) : null,
    samplesPerPeriod: randomSample
      ? faker.number.int({ min: 2, max: 6 })
      : null,
    periodDays: randomSample ? 7 : null,
    occurrenceLimit:
      recurrenceKind === 'one_off'
        ? null
        : faker.number.int({ min: 20, max: 90 }),
    windowStartMinute: 480,
    windowEndMinute: 1_320,
    // At go-live, before the first participant enrols (day 15): an
    // enrolment-anchored run is resolved against an existing schedule.
    createdAt: shiftDays(study.createdAt, 14),
  };
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
      plan.anchorDate,
      plan.anchorOffsetMinutes,
      recurrenceKind,
      plan.intervalDays,
      plan.samplesPerPeriod,
      plan.periodDays,
      // A day apart at the earliest inside a 08:00–22:00 window is at least
      // ten hours, so a gap of up to four keeps every drawn pair legal.
      randomSample ? faker.number.int({ min: 60, max: 240 }) : null,
      plan.occurrenceLimit,
      plan.windowStartMinute,
      plan.windowEndMinute,
      127,
      plan.windowEndMinute,
      plan.windowStartMinute,
      faker.number.int({ min: 1, max: 4 }),
      promptExpiryHours,
      faker.helpers.arrayElement(['skip', 'reschedule_within_period']),
      team.index % 2 === 0 ? ['email'] : ['email', 'sms'],
      JSON.stringify({ quietHoursRespectLocalHolidays: false }),
      plan.createdAt,
    ],
  );
  return plan;
}

/**
 * The local days, counted from the anchor's local date, on which `schedule`
 * prompts — its recurrence applied over the resolution horizon and capped by
 * its occurrence limit. A one-off prompts once, the day after its anchor; a
 * fixed interval every `intervalDays`; a random sample draws
 * `samplesPerPeriod` distinct days from each period, which keeps every pair
 * of draws at least a night apart.
 */
function promptDays(schedule: SeededSchedule): number[] {
  const limit = schedule.occurrenceLimit ?? Number.POSITIVE_INFINITY;
  const days: number[] = [];
  switch (schedule.recurrenceKind) {
    case 'one_off':
      return [1];
    case 'fixed_interval': {
      const interval = schedule.intervalDays ?? 1;
      for (
        let day = interval;
        day <= RESOLUTION_HORIZON_DAYS && days.length < limit;
        day += interval
      ) {
        days.push(day);
      }
      return days;
    }
    case 'random_sample': {
      const period = schedule.periodDays ?? 7;
      const samples = schedule.samplesPerPeriod ?? 1;
      for (
        let start = 0;
        start < RESOLUTION_HORIZON_DAYS && days.length < limit;
        start += period
      ) {
        const candidates = Array.from(
          { length: Math.min(period, RESOLUTION_HORIZON_DAYS - start) },
          (_, offset) => start + offset + 1,
        );
        const drawn = faker.helpers
          .arrayElements(candidates, Math.min(samples, candidates.length))
          .toSorted((a, b) => a - b);
        for (const day of drawn) {
          if (days.length < limit) days.push(day);
        }
      }
      return days;
    }
  }
}

function anchorInstant(
  schedule: SeededSchedule,
  study: SeedStudy,
  participant: SeedParticipant,
): Date {
  const base =
    schedule.anchorKind === 'fixed_date'
      ? schedule.anchorDate!
      : schedule.anchorKind === 'wave_window_start'
        ? (study.waves[0]?.opensAt ?? study.createdAt)
        : participant.enrolledAt;
  return shiftMinutes(base, schedule.anchorOffsetMinutes);
}

async function seedOccurrences(
  client: pg.PoolClient,
  team: SeedTeam,
  study: SeedStudy,
  schedule: SeededSchedule,
): Promise<SeededOccurrence[]> {
  const rows: SeedRowValue[][] = [];
  const occurrences: SeededOccurrence[] = [];

  // Only the head of the cohort gets a resolved run of prompts: a few
  // participants' worth already shows every occurrence state, every recurrence
  // and every zone the corpus has, and keeps the outbox below readable.
  //
  // Each run is what the resolver's contract says it will be: the schedule's
  // own recurrence from its own anchor, every prompt inside the participant's
  // local window on a day the recurrence names, and the absolute instant
  // computed from that local intent under the participant's zone — so the
  // stored rows are ones the real resolver (#1304) could have produced.
  const now = seedTime(0);
  const cohort = study.participants.slice(0, SCHEDULED_PARTICIPANTS);
  for (const participant of cohort) {
    const anchor = anchorInstant(schedule, study, participant);
    const anchorDate = localParts(anchor, participant.timezone).date;
    // Resolved once the anchor is known, and never before the schedule
    // itself existed.
    const resolvedAt = new Date(
      Math.max(shiftMinutes(anchor, 1).getTime(), schedule.createdAt.getTime()),
    );
    for (const [index, day] of promptDays(schedule).entries()) {
      const localDate = shiftLocalDate(anchorDate, day);
      const localMinute = faker.number.int({
        min: schedule.windowStartMinute,
        max: schedule.windowEndMinute - 1,
      });
      const scheduledFor = instantFor(
        localDate,
        localMinute,
        participant.timezone,
      );
      // Past occurrences were dispatched or lapsed; the future is pending.
      const state =
        scheduledFor < now
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
        scheduledFor,
        localDate,
        localMinute,
        participant.timezone,
        shiftMinutes(scheduledFor, schedule.promptExpiryHours * 60),
        state,
        resolvedAt,
      ]);
      occurrences.push({
        id,
        studyId: study.id,
        participant,
        scheduledFor,
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

type SeededTemplate = {
  id: string;
  kind: string;
  channel: string;
  subject: string | null;
  body: string;
};

/** Every kind on every channel at team level, plus one Spanish override. */
async function seedMessageTemplates(
  client: pg.PoolClient,
  team: SeedTeam,
): Promise<SeededTemplate[]> {
  const rows: SeedRowValue[][] = [];
  const templates: SeededTemplate[] = [];
  // Before the first participant enrols and is invited (around 305 days
  // before the anchor), and after the team itself exists (400 days before).
  const createdAt = seedTime(-380 + team.index);

  const push = (kind: string, channel: string, locale: string) => {
    const id = seedUuid();
    const subject =
      channel === 'email'
        ? `${kind === 'invitation' ? 'You are invited' : 'A short check-in'} — {{studyName}}`
        : null;
    const body = `${faker.lorem.sentence()} {{interviewLink}}`;
    rows.push([
      id,
      team.id,
      null,
      kind,
      channel,
      locale,
      1,
      'published',
      subject,
      body,
      createdAt,
      createdAt,
    ]);
    templates.push({ id, kind, channel, subject, body });
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
  // When each opted out: a delivery enqueued before that moment went out
  // normally, and only the ones after it are suppressed, so the outbox and
  // the suppression list tell one story in time.
  const optOutMoment = (participant: SeedParticipant) =>
    shiftDays(participant.enrolledAt, 20);
  const optOutAtByIndex = new Map(
    optedOut.map((participant) => [
      contactBlindIndex(participant.contactAddress),
      optOutMoment(participant),
    ]),
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
        optOutMoment(participant),
      ]);
    }
  }

  const templateFor = (kind: string, channel: string) =>
    templates.find(
      (template) => template.kind === kind && template.channel === channel,
    )!;
  // What the participant would have received: the cited template's body with
  // its placeholders filled from the seeded study and the participant's own
  // interview link. The hash is the schema's evidence of the exact message,
  // so it is taken over that rendering and nothing else.
  const render = (template: SeededTemplate, participant: SeedParticipant) => {
    const link =
      study.links.find(
        (candidate) => candidate.participantId === participant.id,
      )?.token ??
      study.links.find((candidate) => candidate.kind === 'anonymous')?.token ??
      '';
    return template.body
      .replaceAll('{{interviewLink}}', link)
      .replaceAll('{{studyName}}', study.name);
  };

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
    const optOutAt = optOutAtByIndex.get(blindIndex);
    const outcome: DeliveryOutcome =
      optOutAt !== undefined && input.createdAt >= optOutAt
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
    const template = templateFor(input.kind, input.channel);

    deliveryRows.push([
      id,
      team.id,
      study.id,
      input.participant.id,
      input.occurrenceId,
      template.id,
      input.kind,
      input.channel,
      blindIndex,
      sha256Hex(render(template, input.participant)),
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
  // Every dispatched occurrence is a send the outbox records — as a sent,
  // failed, suppressed or uncertain delivery — so the schedule and the
  // outbox agree about what went out.
  const dispatched = occurrences.filter(
    (occurrence) => occurrence.state === 'dispatched',
  );
  const byParticipant = new Map<string, number>();
  for (const occurrence of dispatched) {
    const seen = byParticipant.get(occurrence.participant.id) ?? 0;
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
