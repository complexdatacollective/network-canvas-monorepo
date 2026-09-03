// The team's outward-facing surfaces: service tokens, webhook subscriptions
// and their delivery outbox, the usability experiments the grant runs, and the
// in-app feedback reports.
import { faker } from '@faker-js/faker';
import type pg from 'pg';

import { insertRows, type SeedRowValue } from './insert.ts';
import type { SeededSession } from './network.ts';
import {
  seedBytes,
  seedHex,
  seedTime,
  seedUuid,
  sha256Hex,
  shiftDays,
  shiftMinutes,
} from './rng.ts';
import type { SeedStudy } from './studies.ts';
import { custodians, type SeedTeam } from './teams.ts';

type TokenPlan = {
  name: string;
  accessLevel: 'read' | 'write';
  includesPii: boolean;
  studyScoped: boolean;
  revoked: boolean;
};

const TOKEN_PLANS: TokenPlan[] = [
  {
    name: 'Analysis pipeline (read only)',
    accessLevel: 'read',
    includesPii: false,
    studyScoped: false,
    revoked: false,
  },
  {
    name: 'Recruitment integration',
    accessLevel: 'write',
    includesPii: true,
    studyScoped: false,
    revoked: false,
  },
  {
    name: 'Wave dashboard export',
    accessLevel: 'read',
    includesPii: false,
    studyScoped: true,
    revoked: false,
  },
  {
    name: 'Retired laptop key',
    accessLevel: 'read',
    includesPii: false,
    studyScoped: false,
    revoked: true,
  },
];

/**
 * Team-owned service tokens. The custodian is always an owner or admin of the
 * team: a token's accountable human has to be someone who could have issued it.
 */
export async function seedApiTokens(
  client: pg.PoolClient,
  team: SeedTeam,
  studies: SeedStudy[],
): Promise<void> {
  const rows: SeedRowValue[][] = [];
  const eligible = custodians(team);
  const scopedStudy = studies.find((study) => study.key === 'live');
  // Two to four per team, taken from a rotating start, so every shape —
  // read/no-PII, write/PII, study-scoped and revoked — appears somewhere in
  // the corpus rather than depending on a draw that may never reach the tail.
  const count = 2 + (team.index % 3);
  const plans = Array.from(
    { length: count },
    (_, offset) => TOKEN_PLANS[(team.index + offset) % TOKEN_PLANS.length]!,
  );
  const createdAt = seedTime(-260 + team.index);

  for (const plan of plans) {
    const custodian = eligible[rows.length % eligible.length]!;
    const revokedAt = plan.revoked ? shiftDays(createdAt, 90) : null;
    rows.push([
      seedUuid(),
      team.id,
      plan.name,
      custodian.userId,
      `ncs_live_${seedHex(4)}`,
      sha256Hex(seedHex(32)),
      plan.studyScoped && scopedStudy !== undefined ? 'study' : 'team',
      plan.studyScoped ? (scopedStudy?.id ?? null) : null,
      plan.accessLevel,
      plan.includesPii,
      shiftDays(createdAt, 365),
      plan.revoked ? null : shiftDays(createdAt, 40),
      revokedAt,
      revokedAt === null ? null : team.adminUserId,
      team.adminUserId,
      createdAt,
    ]);
  }

  await insertRows(
    client,
    'api_tokens',
    [
      'id',
      'team_id',
      'name',
      'custodian_user_id',
      'token_prefix',
      'token_hash',
      'scope_kind',
      'study_id',
      'access_level',
      'includes_pii',
      'expires_at',
      'last_used_at',
      'revoked_at',
      'revoked_by_user_id',
      'created_by_user_id',
      'created_at',
    ],
    rows,
  );
}

const WEBHOOK_EVENT_TYPES = [
  'session.completed',
  'session.abandoned',
  'participant.enrolled',
  'wave.opened',
  'consent.withdrawn',
];

type WebhookDisablement = {
  id: string;
  failures: number;
  lastFailureAt: Date;
  disabledAt: Date;
};

/**
 * One or two subscriptions per team, the second of which is disabled after a
 * run of failures — the state the retry policy is meant to reach.
 *
 * Every subscription is written active and every delivery draws its event
 * type from its own subscription's filter, because
 * `webhook_deliveries_subscription_wants_event` admits a delivery only while
 * its subscription is active and only for an event type that subscription
 * asks for. The disablement is applied afterwards, which is also the order it
 * happens in: the deliveries fail, and the run of failures disables the
 * endpoint (the same shape as `closeStudy`, which seals an archived study only
 * once its data is written).
 *
 * The signing secret is stored as ciphertext because Standard Webhooks
 * requires the server to reproduce it on every send. The seed has no key
 * management, so it writes opaque bytes under a placeholder key id: nothing
 * can sign with them, which is the honest state for synthetic data.
 */
export async function seedWebhooks(
  client: pg.PoolClient,
  team: SeedTeam,
  studies: SeedStudy[],
): Promise<void> {
  const subscriptionRows: SeedRowValue[][] = [];
  const deliveryRows: SeedRowValue[][] = [];
  const disablements: WebhookDisablement[] = [];
  const createdAt = seedTime(-250 + team.index);

  // Two per team: one that stays active, and one disabled by a run of
  // failures — the state the retry policy is meant to reach.
  for (let index = 0; index < 2; index++) {
    const id = seedUuid();
    const disabled = index === 1;
    const eventTypes = faker.helpers.arrayElements(WEBHOOK_EVENT_TYPES, {
      min: 1,
      max: 4,
    });
    subscriptionRows.push([
      id,
      team.id,
      index === 1
        ? (studies.find((study) => study.key === 'live')?.id ?? null)
        : null,
      `https://hooks.${team.slug}.example.org/studio/${seedHex(6)}`,
      disabled
        ? 'Retired endpoint, kept for the failure history'
        : faker.lorem.sentence(),
      eventTypes,
      seedBytes(48),
      `dev-integration-key-1`,
      'active',
      0,
      null,
      null,
      team.adminUserId,
      createdAt,
      createdAt,
    ]);
    const deliveries = faker.number.int({ min: 5, max: 20 });
    // What the disablement is derived from: the failures the deliveries
    // below actually record, so the counter, the last failure and the
    // moment the endpoint was disabled all point at rows in its history.
    const failedAt: Date[] = [];
    for (let delivery = 0; delivery < deliveries; delivery++) {
      const enqueuedAt = shiftMinutes(createdAt, delivery * 173);
      const failed = disabled || delivery % 7 === 6;
      const pending = !failed && delivery % 11 === 10;
      if (failed) failedAt.push(shiftMinutes(enqueuedAt, 30));
      deliveryRows.push([
        seedUuid(),
        team.id,
        id,
        `whk_${seedHex(10)}`,
        faker.helpers.arrayElement(eventTypes),
        JSON.stringify({
          teamId: team.id,
          resourceId: seedUuid(),
          sequence: delivery + 1,
        }),
        pending ? 0 : faker.number.int({ min: 1, max: 4 }),
        enqueuedAt,
        null,
        null,
        pending || failed ? null : shiftMinutes(enqueuedAt, 2),
        failed ? shiftMinutes(enqueuedAt, 30) : null,
        pending ? null : failed ? 502 : 200,
        failed ? 'endpoint returned 502' : null,
        enqueuedAt,
      ]);
    }
    if (disabled) {
      const lastFailureAt = failedAt.at(-1)!;
      disablements.push({
        id,
        failures: failedAt.length,
        lastFailureAt,
        disabledAt: shiftMinutes(lastFailureAt, 1),
      });
    }
  }

  await insertRows(
    client,
    'webhook_subscriptions',
    [
      'id',
      'team_id',
      'study_id',
      'url',
      'description',
      'event_types',
      'secret_ciphertext',
      'secret_key_id',
      'state',
      'consecutive_failures',
      'last_failure_at',
      'disabled_at',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ],
    subscriptionRows,
  );
  await insertRows(
    client,
    'webhook_deliveries',
    [
      'id',
      'team_id',
      'subscription_id',
      'webhook_id',
      'event_type',
      'payload',
      'attempt_count',
      'available_at',
      'lease_owner',
      'lease_expires_at',
      'delivered_at',
      'failed_at',
      'last_status_code',
      'last_error',
      'created_at',
    ],
    deliveryRows,
  );

  for (const disablement of disablements) {
    await client.query(
      `update webhook_subscriptions
       set state = 'disabled', consecutive_failures = $3,
           last_failure_at = $4, disabled_at = $5, updated_at = $5
       where id = $1 and team_id = $2`,
      [
        disablement.id,
        team.id,
        disablement.failures,
        disablement.lastFailureAt,
        disablement.disabledAt,
      ],
    );
  }
}

/** Two experiments per team: one still running, one already stopped. */
export async function seedExperiments(
  client: pg.PoolClient,
  team: SeedTeam,
  studies: SeedStudy[],
  sessions: SeededSession[],
): Promise<void> {
  const experimentRows: SeedRowValue[][] = [];
  const assignmentRows: SeedRowValue[][] = [];
  const exposureRows: SeedRowValue[][] = [];
  const createdAt = seedTime(-240 + team.index);

  const plans = [
    {
      key: 'study_list_density',
      name: 'Study list density',
      surface: 'researcher',
      state: 'running',
    },
    {
      key: 'consent_summary_first',
      name: 'Consent summary first',
      surface: 'participant',
      state: 'stopped',
    },
  ] as const;

  const participants = studies.flatMap((study) => study.participants);

  for (const [planIndex, plan] of plans.entries()) {
    const experimentId = seedUuid();
    const startedAt = shiftDays(createdAt, planIndex * 5);
    experimentRows.push([
      experimentId,
      team.id,
      plan.key,
      plan.name,
      plan.surface,
      plan.state,
      JSON.stringify([
        { key: 'control', weight: 1 },
        { key: 'variant_a', weight: 1 },
      ]),
      startedAt,
      plan.state === 'stopped' ? shiftDays(startedAt, 45) : null,
      createdAt,
    ]);

    const subjects =
      plan.surface === 'researcher'
        ? team.members.map((member) => ({
            kind: 'user' as const,
            id: member.userId,
          }))
        : participants.slice(0, 12).map((participant) => ({
            kind: 'participant' as const,
            id: participant.id,
          }));

    for (const [subjectIndex, subject] of subjects.entries()) {
      const assignmentId = seedUuid();
      const variantKey = subjectIndex % 2 === 0 ? 'control' : 'variant_a';
      const assignedAt = shiftDays(startedAt, subjectIndex % 7);
      assignmentRows.push([
        assignmentId,
        team.id,
        experimentId,
        subject.kind,
        subject.id,
        variantKey,
        assignedAt,
      ]);
      const exposures = faker.number.int({ min: 1, max: 5 });
      for (let exposure = 0; exposure < exposures; exposure++) {
        exposureRows.push([
          seedUuid(),
          team.id,
          experimentId,
          assignmentId,
          variantKey,
          plan.surface === 'researcher' ? 'studies.list' : 'consent.screen',
          shiftMinutes(assignedAt, exposure * 97 + 5),
          JSON.stringify({ sessionCount: sessions.length }),
        ]);
      }
    }
  }

  await insertRows(
    client,
    'experiments',
    [
      'id',
      'team_id',
      'key',
      'name',
      'surface',
      'state',
      'variants',
      'started_at',
      'stopped_at',
      'created_at',
    ],
    experimentRows,
  );
  await insertRows(
    client,
    'experiment_assignments',
    [
      'id',
      'team_id',
      'experiment_id',
      'subject_kind',
      'subject_id',
      'variant_key',
      'assigned_at',
    ],
    assignmentRows,
  );
  await insertRows(
    client,
    'experiment_exposures',
    [
      'id',
      'team_id',
      'experiment_id',
      'assignment_id',
      'variant_key',
      'surface_key',
      'occurred_at',
      'details',
    ],
    exposureRows,
  );
}

/** Three to eight reports per team, at least one sent without its context. */
export async function seedFeedback(
  client: pg.PoolClient,
  team: SeedTeam,
  studies: SeedStudy[],
): Promise<void> {
  const rows: SeedRowValue[][] = [];
  const createdAt = seedTime(-120 + team.index);
  const count = faker.number.int({ min: 3, max: 8 });

  for (let index = 0; index < count; index++) {
    // The first report of every team is the one whose reporter declined to
    // attach any context, which the schema then requires to be empty.
    const withContext = index > 0;
    const reporterKind =
      index % 3 === 2 ? 'participant' : index % 3 === 1 ? 'anonymous' : 'user';
    const state =
      index % 4 === 0
        ? 'new'
        : faker.helpers.arrayElement(['triaged', 'forwarded', 'closed']);
    const reportedAt = shiftDays(createdAt, index);
    rows.push([
      seedUuid(),
      team.id,
      faker.helpers.arrayElement(studies).id,
      reporterKind,
      reporterKind === 'user' ? team.adminUserId : null,
      index % 2 === 0 ? 'bug' : 'suggestion',
      faker.lorem.sentences(2),
      withContext
        ? JSON.stringify({
            route: '/study/overview',
            appVersion: '0.2.0',
            schemaVersion: 8,
          })
        : JSON.stringify({}),
      withContext,
      state,
      state === 'forwarded'
        ? `https://github.com/complexdatacollective/Network-Canvas/issues/${faker.number.int({ min: 1000, max: 9999 })}`
        : null,
      reportedAt,
      state === 'new' ? null : shiftDays(reportedAt, 2),
    ]);
  }

  await insertRows(
    client,
    'feedback_reports',
    [
      'id',
      'team_id',
      'study_id',
      'reporter_kind',
      'reporter_user_id',
      'kind',
      'body',
      'context',
      'context_consent',
      'state',
      'external_ref',
      'created_at',
      'triaged_at',
    ],
    rows,
  );
}
