// The team's outward-facing surfaces: service tokens, webhook subscriptions
// and their delivery outbox, the usability experiments the grant runs, and the
// in-app feedback reports.
import { faker } from '@faker-js/faker';
import { Effect } from 'effect';

import { Transaction } from '../../src/db/tenant.ts';
import type { SecretsCipherApi } from '../../src/secrets/cipher.ts';
import { insertRows, type SeedRowValue } from './insert.ts';
import type { SeededSession } from './network.ts';
import {
  seedHex,
  seedTime,
  seedUuid,
  sha256Hex,
  shiftDays,
  shiftMinutes,
} from './rng.ts';
import type { SeedStudy, SeedWithdrawal } from './studies.ts';
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
export const seedApiTokens = Effect.fnUntraced(function* (
  team: SeedTeam,
  studies: SeedStudy[],
) {
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

  yield* insertRows(
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
});

const WEBHOOK_EVENT_TYPES = [
  'session.completed',
  'session.abandoned',
  'participant.enrolled',
  'wave.opened',
  'consent.withdrawn',
];

/** A row the seeded event is about, and when it came to be. */
type WebhookResource = { id: string; studyId: string; occurredAt: Date };

/**
 * The resources each event type can cite, drawn from what this seed has
 * already written: a completed or abandoned session, an enrolled participant,
 * an opened wave, a withdrawn consent. A payload names a row that exists, and
 * is enqueued no earlier than the moment that row records.
 */
function webhookResources(
  studies: SeedStudy[],
  sessions: SeededSession[],
  withdrawals: SeedWithdrawal[],
): Map<string, WebhookResource[]> {
  const sessionsWith = (status: SeededSession['status']) =>
    sessions
      .filter((session) => session.status === status)
      .map((session) => ({
        id: session.id,
        studyId: session.studyId,
        occurredAt: session.endedAt ?? session.startedAt,
      }));
  return new Map<string, WebhookResource[]>([
    ['session.completed', sessionsWith('completed')],
    ['session.abandoned', sessionsWith('abandoned')],
    [
      'participant.enrolled',
      studies.flatMap((study) =>
        study.participants.map((participant) => ({
          id: participant.id,
          studyId: study.id,
          occurredAt: participant.enrolledAt,
        })),
      ),
    ],
    [
      'wave.opened',
      studies.flatMap((study) =>
        study.waves
          .filter((wave) => wave.opensAt !== null)
          .map((wave) => ({
            id: wave.id,
            studyId: study.id,
            occurredAt: wave.opensAt!,
          })),
      ),
    ],
    [
      'consent.withdrawn',
      withdrawals.map((withdrawal) => ({
        id: withdrawal.consentId,
        studyId: withdrawal.studyId,
        occurredAt: withdrawal.withdrawnAt,
      })),
    ],
  ]);
}

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
 * requires the server to reproduce it on every send. Since #1900 the seed
 * seals a real `whsec_` secret through the deployment's own cipher rather than
 * writing opaque bytes under a placeholder key id: a seeded instance is then a
 * working one — the worker can sign a delivery — and the boot check, which
 * refuses to serve while a stored key id is one the keyring cannot produce,
 * has real rows to read. The plaintexts are returned so the dump-and-search
 * test knows what to look for.
 */
export const seedWebhooks = Effect.fnUntraced(function* (
  team: SeedTeam,
  studies: SeedStudy[],
  sessions: SeededSession[],
  withdrawals: SeedWithdrawal[],
  cipher: SecretsCipherApi,
) {
  const { sql } = yield* Transaction;
  const subscriptionRows: SeedRowValue[][] = [];
  const deliveryRows: SeedRowValue[][] = [];
  const disablements: WebhookDisablement[] = [];
  const plaintextSecrets: string[] = [];
  const createdAt = seedTime(-250 + team.index);
  const resources = webhookResources(studies, sessions, withdrawals);

  // Two per team: one that stays active, and one disabled by a run of
  // failures — the state the retry policy is meant to reach.
  for (let index = 0; index < 2; index++) {
    const id = seedUuid();
    const disabled = index === 1;
    // The second is scoped to the live study; the first hears the whole team.
    const studyId =
      index === 1
        ? (studies.find((study) => study.key === 'live')?.id ?? null)
        : null;
    const inScope = (resource: WebhookResource) =>
      studyId === null || resource.studyId === studyId;
    // Subscribe only to events this scope has something to say about, so
    // every delivery below can cite a real row.
    const eventTypes = faker.helpers.arrayElements(
      WEBHOOK_EVENT_TYPES.filter((eventType) =>
        (resources.get(eventType) ?? []).some(inScope),
      ),
      { min: 1, max: 4 },
    );
    // Sealed against this row's own identity, so the seeded corpus exercises
    // the AAD binding as a real subscription does: the ciphertext opens only
    // as (this team, this subscription).
    const secret = `whsec_${seedHex(24)}`;
    plaintextSecrets.push(secret);
    const sealed = cipher.sealWebhookSecret(
      { teamId: team.id, subscriptionId: id },
      secret,
    );
    subscriptionRows.push([
      id,
      team.id,
      studyId,
      `https://hooks.${team.slug}.example.org/studio/${seedHex(6)}`,
      disabled
        ? 'Retired endpoint, kept for the failure history'
        : faker.lorem.sentence(),
      eventTypes,
      sealed.ciphertext,
      sealed.keyId,
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
      const eventType = faker.helpers.arrayElement(eventTypes);
      const resource = faker.helpers.arrayElement(
        (resources.get(eventType) ?? []).filter(inScope),
      );
      // Enqueued on the endpoint's own cadence, and never before the row it
      // reports came to be.
      const enqueuedAt = new Date(
        Math.max(
          shiftMinutes(createdAt, delivery * 173).getTime(),
          shiftMinutes(resource.occurredAt, 1).getTime(),
        ),
      );
      const failed = disabled || delivery % 7 === 6;
      const pending = !failed && delivery % 11 === 10;
      if (failed) failedAt.push(shiftMinutes(enqueuedAt, 30));
      deliveryRows.push([
        seedUuid(),
        team.id,
        id,
        `whk_${seedHex(10)}`,
        eventType,
        JSON.stringify({
          teamId: team.id,
          studyId: resource.studyId,
          resourceId: resource.id,
          sequence: delivery + 1,
        }),
        pending ? 0 : faker.number.int({ min: 1, max: 4 }),
        pending || failed ? null : shiftMinutes(enqueuedAt, 2),
        failed ? shiftMinutes(enqueuedAt, 30) : null,
        pending ? null : failed ? 502 : 200,
        failed ? 'endpoint returned 502' : null,
        enqueuedAt,
      ]);
    }
    if (disabled) {
      const lastFailureAt = new Date(
        Math.max(...failedAt.map((moment) => moment.getTime())),
      );
      disablements.push({
        id,
        failures: failedAt.length,
        lastFailureAt,
        disabledAt: shiftMinutes(lastFailureAt, 1),
      });
    }
  }

  yield* insertRows(
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
  yield* insertRows(
    'webhook_deliveries',
    [
      'id',
      'team_id',
      'subscription_id',
      'webhook_id',
      'event_type',
      'payload',
      'attempt_count',
      'delivered_at',
      'failed_at',
      'last_status_code',
      'last_error',
      'created_at',
    ],
    deliveryRows,
  );

  for (const disablement of disablements) {
    yield* sql.unsafe(
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

  return plaintextSecrets;
});

/** Two experiments per team: one still running, one already stopped. */
export const seedExperiments = Effect.fnUntraced(function* (
  team: SeedTeam,
  studies: SeedStudy[],
  sessions: SeededSession[],
) {
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

  yield* insertRows(
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
  yield* insertRows(
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
  yield* insertRows(
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
});

/** Three to eight reports per team, at least one sent without its context. */
export const seedFeedback = Effect.fnUntraced(function* (
  team: SeedTeam,
  studies: SeedStudy[],
) {
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

  yield* insertRows(
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
});
