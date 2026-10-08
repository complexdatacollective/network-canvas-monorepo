import { randomUUID } from 'node:crypto';

import { assert, layer } from '@effect/vitest';
import { Effect, Exit, Layer, Redacted, Schema } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';

import { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';
import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { UserId } from '@codaco/studio-contract/schema/ids';
import { AnalyticsDeliveryJobSchema } from '@codaco/studio-sync/jobs';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import { userAuditActor } from '../../audit/actor.ts';
import { audited, auditable, changed } from '../../audit/audited.ts';
import {
  AUDIT_EVENT_REGISTRY,
  type AuditEventInput,
  parseAuditEventInput,
} from '../../audit/events.ts';
import { AuditSignal } from '../../audit/signal.ts';
import { TenantScope, unsafeMakeTeamAccess } from '../../db/tenant.ts';
import { RequestId } from '../../http/middleware/request-id.ts';
import { Jobs } from '../../jobs/jobs.ts';
import { Analytics } from '../../platform/analytics.ts';
import { AUDIT_USAGE_DECISIONS, recordAuditUsage } from '../audit-usage.ts';
import { usageCapture } from '../usage-events.ts';

const REGISTERED_TYPES = [
  ...new Set(
    Object.values(AUDIT_EVENT_REGISTRY).map(({ fixture }) => fixture.eventType),
  ),
].toSorted();

const fixtures: readonly AuditEventInput[] = Object.values(
  AUDIT_EVENT_REGISTRY,
).map(({ fixture }) => parseAuditEventInput(fixture));

const fixtureLabels: readonly string[] = Object.values(
  AUDIT_EVENT_REGISTRY,
).flatMap(({ fixture }) =>
  [
    fixture.teamLabel,
    fixture.actorLabel,
    fixture.subjectLabel,
    fixture.resourceLabel,
  ].flatMap((label) => (typeof label === 'string' ? [label] : [])),
);

describe('the usage decision for each audit event type', () => {
  it('decides every audit event type and only those', () => {
    expect(Object.keys(AUDIT_USAGE_DECISIONS).toSorted()).toEqual(
      REGISTERED_TYPES,
    );
  });

  it('sends nothing for a denial, a failure or a read of the audit log', () => {
    for (const fixture of fixtures) {
      if (
        fixture.outcome !== 'succeeded' ||
        fixture.eventType.startsWith('audit.')
      ) {
        expect(
          AUDIT_USAGE_DECISIONS[fixture.eventType].kind,
          fixture.eventType,
        ).toBe('none');
      }
    }
  });

  it('gives a reason for every event type it sends nothing for', () => {
    for (const [eventType, decision] of Object.entries(AUDIT_USAGE_DECISIONS)) {
      if (decision.kind === 'none') {
        expect(decision.reason.length, eventType).toBeGreaterThan(40);
      }
    }
  });

  it('sends an event for each tracked action', () => {
    expect(
      Object.entries(AUDIT_USAGE_DECISIONS)
        .filter(([, decision]) => decision.kind === 'event')
        .map(([eventType]) => eventType)
        .toSorted(),
    ).toEqual([
      'interview.completed',
      'interview.started',
      'protocol.created',
      'protocol.draft.committed',
      'study.created',
      'team.invitation.accepted',
      'team.invitation.created',
      'team.member.role_changed',
    ]);
  });
});

const REQUEST_ID = '00000000-0000-4000-8000-0000000000b1';

const principal = Principal.of({
  kind: 'user',
  userId: Schema.decodeSync(UserId)('usageActor0000000000000000000001'),
  email: Redacted.make('usage-actor@example.test'),
  emailVerified: true,
  name: Redacted.make('Usage Actor'),
  locale: null,
  sessionId: 'usage-session',
});

const ROLE_CHANGED = {
  eventType: 'team.member.role_changed',
  eventVersion: 1,
  category: 'team_access',
  subjectType: 'team_member',
  subjectId: 'usageMember00000000000000000001',
  subjectLabel: Redacted.make('Subject Member'),
  resourceType: null,
  resourceId: null,
  resourceLabel: null,
  details: { previousRoles: ['member'], newRoles: ['admin'] },
} as const;

class RoleChangeDenied extends Error {}

const JobsForHarness = Layer.unwrap(
  Effect.map(TestDatabase, (harness) =>
    Jobs.layer({ schema: harness.jobSchema }),
  ),
);

const Harness = Layer.mergeAll(
  AuditSignal.layer,
  Layer.succeed(Principal, principal),
  Layer.succeed(AuditActor, userAuditActor(principal)),
  Layer.succeed(RequestId, RequestId.of(REQUEST_ID)),
  JobsForHarness,
).pipe(Layer.provideMerge(TestDatabaseLive));

const seedTeam = Effect.fnUntraced(function* () {
  const harness = yield* TestDatabase;
  const team = unsafeMakeTeamAccess(
    `usageTeam${randomUUID().replaceAll('-', '').slice(0, 16)}`,
    'owner',
  );
  yield* harness.onOwner(
    harness.owner.sql`insert into teams (id, name, slug)
                      values (${team.teamId}, 'LEVEL2_TEAM_NAME', ${team.teamId})`,
  );
  return team;
});

const seedStudy = Effect.fnUntraced(function* (
  teamId: string,
  settings: Record<string, unknown>,
) {
  const harness = yield* TestDatabase;
  const studyId = randomUUID();
  yield* harness.onOwner(
    harness.owner.sql`insert into studies (id, team_id, name, settings)
                      values (${studyId}, ${teamId}, 'LEVEL2_STUDY_NAME',
                              ${JSON.stringify(settings)}::jsonb)`,
  );
  return studyId;
});

const interviewFixtures = fixtures.filter(
  (fixture) =>
    fixture.eventType === 'interview.started' ||
    fixture.eventType === 'interview.completed',
);

const inStudy = (
  fixture: AuditEventInput,
  teamId: string,
  studyId: string,
): AuditEventInput => {
  if (fixture.eventType === 'interview.started') {
    return {
      ...fixture,
      teamId,
      resourceId: randomUUID(),
      details: { ...fixture.details, studyId },
    };
  }
  if (fixture.eventType === 'interview.completed') {
    return {
      ...fixture,
      teamId,
      resourceId: randomUUID(),
      details: { ...fixture.details, studyId },
    };
  }
  return fixture;
};

const decodeJob = Schema.decodeUnknownSync(AnalyticsDeliveryJobSchema);

const queuedUsage = Effect.fnUntraced(function* (teamId: string) {
  const harness = yield* TestDatabase;
  const rows = yield* harness.onOwner(
    harness.owner.sql<{ payload: unknown }>`
      select payload from ${harness.owner.sql(harness.jobSchema)}.jobs
       where queue = 'analytics-delivery'
         and payload->'usage'->>'teamId' = ${teamId}`,
  );
  return rows.map(({ payload }) => decodeJob(payload).usage);
});

const auditRows = Effect.fnUntraced(function* (teamId: string) {
  const harness = yield* TestDatabase;
  return yield* harness.onOwner(
    harness.owner.sql<{
      event_type: string;
      outcome: string;
      actor_id: string;
      request_id: string;
    }>`select event_type, outcome, actor_id, request_id
         from audit_events
        where team_id = ${teamId}
        order by sequence`,
  );
});

const changeRole = (team: ReturnType<typeof unsafeMakeTeamAccess>) =>
  audited(
    'team.updateMemberRole',
    team,
    Effect.succeed(changed('ok', [ROLE_CHANGED])),
  ).pipe(TestClock.withLive);

describe.skipIf(!testDb)('usage recorded in the audited action', () => {
  layer(Harness)((suite) => {
    suite.effect(
      'queues exactly one event for a committed action, as the audited actor',
      () =>
        Effect.gen(function* () {
          const team = yield* seedTeam();
          yield* changeRole(team).pipe(
            Effect.provide(Analytics.layerRecording),
          );

          const [audit] = yield* auditRows(team.teamId);
          const queued = yield* queuedUsage(team.teamId);
          assert.lengthOf(queued, 1);
          const usage = queued[0];
          assert.deepStrictEqual(usage, {
            event: 'team_member_role_changed',
            occurredAt: usage?.occurredAt ?? 0,
            accountId: principal.userId,
            teamId: team.teamId,
            memberId: ROLE_CHANGED.subjectId,
            previousRoles: ['member'],
            newRoles: ['admin'],
          });
          assert.strictEqual(
            usage && 'accountId' in usage ? usage.accountId : undefined,
            audit?.actor_id,
          );
          assert.strictEqual(audit?.request_id, REQUEST_ID);
          assert.isAbove(usage?.occurredAt ?? 0, Date.UTC(2026, 0, 1));
        }),
    );

    suite.effect('queues nothing while telemetry is off', () =>
      Effect.gen(function* () {
        const team = yield* seedTeam();
        yield* changeRole(team).pipe(Effect.provide(Analytics.layerDisabled));

        assert.lengthOf(yield* auditRows(team.teamId), 1);
        assert.deepStrictEqual(yield* queuedUsage(team.teamId), []);
      }),
    );

    suite.effect('queues nothing for a denied action', () =>
      Effect.gen(function* () {
        const team = yield* seedTeam();
        const exit = yield* Effect.exit(
          audited(
            'team.updateMemberRole',
            team,
            Effect.fail(
              auditable(new RoleChangeDenied(), {
                outcome: 'denied',
                events: [
                  {
                    ...ROLE_CHANGED,
                    eventType: 'team.member.role_change_denied',
                    details: {
                      requestedRoles: ['admin'],
                      reason: 'insufficient_permission',
                    },
                  },
                ],
              }),
            ),
          ).pipe(Effect.provide(Analytics.layerRecording)),
        );

        assert.isTrue(Exit.isFailure(exit));
        assert.deepStrictEqual(
          (yield* auditRows(team.teamId)).map(({ outcome }) => outcome),
          ['denied'],
        );
        assert.deepStrictEqual(yield* queuedUsage(team.teamId), []);
      }),
    );

    suite.effect(
      'queues nothing when the action’s transaction rolls back after it',
      () =>
        Effect.gen(function* () {
          const team = yield* seedTeam();
          const harness = yield* TestDatabase;
          const trigger = `refuse_${team.teamId.toLowerCase()}`;
          yield* harness.onOwner(
            harness.owner.sql.unsafe(`
              CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$
              BEGIN RAISE EXCEPTION 'refused at commit'; END $$`),
          );
          yield* harness.onOwner(
            harness.owner.sql.unsafe(`
              CREATE CONSTRAINT TRIGGER ${trigger}
                AFTER INSERT ON audit_events
                DEFERRABLE INITIALLY DEFERRED
                FOR EACH ROW WHEN (NEW.team_id = '${team.teamId}')
                EXECUTE FUNCTION ${trigger}()`),
          );

          const exit = yield* Effect.exit(
            changeRole(team).pipe(Effect.provide(Analytics.layerRecording)),
          );

          yield* harness.onOwner(
            harness.owner.sql.unsafe(`DROP TRIGGER ${trigger} ON audit_events`),
          );
          yield* harness.onOwner(
            harness.owner.sql.unsafe(`DROP FUNCTION ${trigger}()`),
          );
          assert.isTrue(Exit.isFailure(exit));
          assert.deepStrictEqual(yield* auditRows(team.teamId), []);
          assert.deepStrictEqual(yield* queuedUsage(team.teamId), []);
        }),
    );

    suite.effect('builds every tracked event from Level 1 values alone', () =>
      Effect.gen(function* () {
        const team = yield* seedTeam();
        const studyId = yield* seedStudy(team.teamId, {});
        assert.isAbove(fixtureLabels.length, 10);

        const recorded: unknown[] = [];
        for (const fixture of fixtures) {
          const decision = AUDIT_USAGE_DECISIONS[fixture.eventType];
          if (decision.kind === 'none') continue;
          const event: AuditEventInput =
            fixture.eventType === 'interview.started' ||
            fixture.eventType === 'interview.completed'
              ? inStudy(fixture, team.teamId, studyId)
              : fixture.eventType === 'protocol.draft.committed'
                ? {
                    ...fixture,
                    teamId: team.teamId,
                    details: { ...fixture.details, draftId: randomUUID() },
                  }
                : { ...fixture, teamId: team.teamId };
          yield* TenantScope.open(team, recordAuditUsage(event)).pipe(
            Effect.provide(Analytics.layerRecording),
            TestClock.withLive,
          );
          recorded.push(event.eventType);
        }

        const queued = yield* queuedUsage(team.teamId);
        assert.strictEqual(queued.length, recorded.length);
        for (const usage of queued) {
          const sent = JSON.stringify([
            usage,
            usageCapture(usage, randomUUID()),
          ]);
          for (const label of fixtureLabels) {
            assert.notInclude(sent, label, usage.event);
          }
        }
      }),
    );

    suite.effect(
      'queues interview events only for a study that allows participant analytics',
      () =>
        Effect.gen(function* () {
          assert.lengthOf(interviewFixtures, 2);
          const team = yield* seedTeam();
          const allowing = yield* seedStudy(team.teamId, {});
          const refusing = yield* seedStudy(team.teamId, {
            participantAnalytics: false,
          });
          for (const studyId of [allowing, refusing]) {
            for (const fixture of interviewFixtures) {
              yield* TenantScope.open(
                team,
                recordAuditUsage(inStudy(fixture, team.teamId, studyId)),
              ).pipe(
                Effect.provide(Analytics.layerRecording),
                TestClock.withLive,
              );
            }
          }

          const queued = yield* queuedUsage(team.teamId);
          assert.deepStrictEqual(
            queued.map((usage) => ('studyId' in usage ? usage.studyId : null)),
            [allowing, allowing],
          );
          assert.deepStrictEqual(
            queued
              .map((usage) => usage.event)
              .toSorted((left, right) => left.localeCompare(right)),
            ['interview_completed', 'interview_started'],
          );
        }),
    );
  });
});
