import { randomUUID } from 'node:crypto';

import { assert, layer } from '@effect/vitest';
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Schedule,
  Schema,
} from 'effect';
import { describe, vi } from 'vitest';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { UserId } from '@codaco/studio-contract/schema/ids';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import { reachableDeniedAuditStore } from '../../__tests__/support/valkey.ts';
import {
  audited,
  auditable,
  type AuditEventBody,
  changed,
  stamp,
} from '../../audit/audited.ts';
import { AuditContext } from '../../audit/context.ts';
import { AuditSignal, RecordedSignals } from '../../audit/signal.ts';
import {
  AUDIT_SEQUENCE_LOCK_SEED,
  AUDIT_TEAM_LOCK_KEY_SQL,
} from '../../audit/store.ts';
import { Database } from '../../db/client.ts';
import {
  type TeamAccess,
  Transaction,
  unsafeMakeTeamAccess,
} from '../../db/tenant.ts';
import { RequestId } from '../../http/middleware/request-id.ts';
import { Jobs, RecordedJobs } from '../../jobs/jobs.ts';
import {
  acceptTeamInvitation,
  cancelTeamInvitation,
  createTeamInvitation,
  TeamCommandError,
  updateTeamMemberRole,
} from '../commands.ts';

// The four audited team commands, against a real Postgres.
//
// What moved to `audit/__tests__/audited.test.ts` when the combinator was
// extracted: the empty-event-list refusal, the savepoint rollback, and the
// team-label snapshot are properties of `audited` and are proved there once,
// rather than once per command tier. What stayed here is everything that is
// this tier's own — which decisions are auditable, which are not, and what
// each command actually writes.
//
// Two things about the harness that are load-bearing:
//
//   * `Jobs.layerRecording`. An invitation's delivery job is created inside the
//     command's own transaction, and the recording layer still requires
//     `Transaction` — so a command that enqueued outside one would not compile
//     under it any more than under the live layer, and a recorded job is
//     evidence the scope was open.
//   * `harness.secondApp`. The application client has ONE connection, which is
//     what makes "the next transaction is on the same backend" a property of
//     the harness. Every concurrency case here therefore runs its second
//     command with `Database` substituted for the second client — two real
//     connections contending for one team's advisory lock.

/**
 * A compile assertion, and the stronger half of "a forged actor context is
 * unrepresentable": a command may not name the fields `audited` owns, and the
 * type says so. The runtime half is the case below, because this check only
 * fires for a fresh object literal.
 */
const forgedContextDoesNotType: AuditEventBody = {
  eventType: 'team.invitation.created',
  eventVersion: 1,
  category: 'team_access',
  subjectType: 'team_invitation',
  subjectId: 'an-invitation',
  subjectLabel: 'forged@example.com',
  resourceType: null,
  resourceId: null,
  resourceLabel: null,
  details: { role: 'member' },
  // @ts-expect-error -- `audited` owns the actor; a command cannot supply one.
  actorId: 'forged-actor',
};
void forgedContextDoesNotType;

/** The same for the outcome, which the marker decides and the body may not. */
const forgedOutcomeDoesNotType: AuditEventBody = {
  eventType: 'team.invitation.created',
  eventVersion: 1,
  category: 'team_access',
  subjectType: 'team_invitation',
  subjectId: 'an-invitation',
  subjectLabel: 'forged@example.com',
  resourceType: null,
  resourceId: null,
  resourceLabel: null,
  details: { role: 'member' },
  // @ts-expect-error -- `audited` stamps the outcome from the decision it saw.
  outcome: 'succeeded',
};
void forgedOutcomeDoesNotType;

/**
 * The three cases below assert where the audit denial window's cap falls, and
 * that window counts in Valkey since #1909. It fails open, so without a store
 * they would not fail to be limited — they would simply not be limited, write
 * a sixth denial event and fail. They skip instead, like the database-backed
 * cases; on CI the probe throws, because there the store is part of the job.
 */
const deniedAuditWindow = await reachableDeniedAuditStore();

type Identity = {
  userId: string;
  memberId: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
};

const identity = (
  teamId: string,
  label: string,
  role: Identity['role'],
): Identity => ({
  userId: `${teamId}-${label}-user`,
  memberId: `${teamId}-${label}-member`,
  email: `${teamId}-${label}@example.com`,
  name: `${label[0]!.toUpperCase()}${label.slice(1)} Person`,
  role,
});

const principalOf = (person: Identity, emailVerified = true) =>
  Principal.of({
    kind: 'user',
    userId: Schema.decodeSync(UserId)(person.userId),
    email: person.email,
    emailVerified,
    name: person.name,
    locale: null,
    sessionId: `${person.userId}-session`,
  });

const access = (teamId: string, role = 'owner'): TeamAccess =>
  unsafeMakeTeamAccess(teamId, role);

const Harness = Layer.mergeAll(
  TestDatabaseLive,
  AuditSignal.layerRecording,
  Jobs.layerRecording,
);

describe.skipIf(!testDb)('audited team commands', () => {
  layer(Harness)('over a provisioned schema', (suite) => {
    /** A fresh team per case: `audit_events` is append-only and cannot be tidied. */
    const seedTeam = Effect.fnUntraced(function* (
      label: string,
      name?: string,
    ) {
      const harness = yield* TestDatabase;
      const teamId = `${label}-${randomUUID().slice(0, 8)}`;
      yield* harness.onOwner(
        harness.owner.sql`insert into teams (id, name, slug)
                          values (${teamId}, ${name ?? teamId}, ${teamId})`,
      );
      return teamId;
    });

    const seedUser = Effect.fnUntraced(function* (person: Identity) {
      const harness = yield* TestDatabase;
      yield* harness.onOwner(
        harness.owner.sql`insert into "user" (id, name, email, "emailVerified")
                          values (${person.userId}, ${person.name},
                                  ${person.email}, true)`,
      );
    });

    const seedIdentity = Effect.fnUntraced(function* (
      teamId: string,
      person: Identity,
    ) {
      const harness = yield* TestDatabase;
      yield* seedUser(person);
      yield* harness.onOwner(
        harness.owner.sql`insert into team_members (id, team_id, user_id, role)
                          values (${person.memberId}, ${teamId},
                                  ${person.userId}, ${person.role})`,
      );
    });

    const seedInvitation = Effect.fnUntraced(function* (input: {
      id: string;
      teamId: string;
      inviterId: string;
      email: string;
      role: string;
      expiresAt?: Date;
    }) {
      const harness = yield* TestDatabase;
      yield* harness.onOwner(
        harness.owner.sql`insert into team_invitations
                            (id, team_id, email, role, status, expires_at,
                             inviter_id)
                          values (${input.id}, ${input.teamId}, ${input.email},
                                  ${input.role}, 'pending',
                                  ${input.expiresAt ?? new Date(Date.now() + 86_400_000)},
                                  ${input.inviterId})`,
      );
    });

    type EventRow = {
      id: string;
      sequence: string;
      event_type: string;
      event_version: number;
      outcome: string;
      actor_id: string | null;
      actor_label: string;
      team_label: string;
      subject_id: string | null;
      subject_label: string | null;
      request_id: string;
      details: Record<string, unknown>;
    };

    const auditRows = Effect.fnUntraced(function* (teamId: string) {
      const harness = yield* TestDatabase;
      return yield* harness.onOwner(
        harness.owner.sql<EventRow>`
          select id, sequence::text as sequence, event_type, event_version,
                 outcome, actor_id, actor_label, team_label, subject_id,
                 subject_label, request_id, details
            from audit_events where team_id = ${teamId} order by sequence`,
      );
    });

    const memberRoles = Effect.fnUntraced(function* (teamId: string) {
      const harness = yield* TestDatabase;
      const rows = yield* harness.onOwner(
        harness.owner.sql<{
          id: string;
          role: string;
        }>`select id, role from team_members where team_id = ${teamId}
             order by id`,
      );
      return rows;
    });

    const invitationStatus = Effect.fnUntraced(function* (id: string) {
      const harness = yield* TestDatabase;
      const rows = yield* harness.onOwner(
        harness.owner.sql<{
          status: string;
        }>`select status from team_invitations where id = ${id}`,
      );
      return rows[0]?.status ?? null;
    });

    /** One command, run as one person, under one request id. */
    const asActor = <A, E, R>(
      person: Identity,
      command: Effect.Effect<A, E, R>,
      options: { emailVerified?: boolean; requestId?: string } = {},
    ) =>
      command.pipe(
        Effect.provideService(
          Principal,
          principalOf(person, options.emailVerified ?? true),
        ),
        Effect.provideService(
          RequestId,
          RequestId.of(options.requestId ?? randomUUID()),
        ),
      );

    /**
     * The same, on the harness's SECOND application client — a real second
     * connection, which is what a concurrency case needs and what the one-
     * connection default deliberately withholds.
     */
    const asContender = <A, E, R>(
      person: Identity,
      command: Effect.Effect<A, E, R>,
    ) =>
      Effect.flatMap(TestDatabase, (harness) =>
        asActor(person, command).pipe(
          Effect.provideService(Database, harness.secondApp),
        ),
      );

    const recorded = Effect.fnUntraced(function* () {
      const jobs = yield* RecordedJobs;
      return jobs.recorded;
    });

    const clearRecorded = Effect.fnUntraced(function* () {
      const jobs = yield* RecordedJobs;
      yield* jobs.clear;
      const signals = yield* RecordedSignals;
      yield* signals.clear;
    });

    // -----------------------------------------------------------------------
    // Invitation acceptance
    // -----------------------------------------------------------------------

    suite.effect(
      'accepts an invitation atomically and treats a lost-response replay as unchanged',
      () =>
        Effect.gen(function* () {
          const teamId = yield* seedTeam('command-accept-invitation');
          const invitationId = randomUUID();
          const owner = identity(teamId, 'owner', 'owner');
          const invitee = identity(teamId, 'invitee', 'admin');
          yield* seedIdentity(teamId, owner);
          yield* seedUser(invitee);
          yield* seedInvitation({
            id: invitationId,
            teamId,
            inviterId: owner.userId,
            email: invitee.email,
            role: invitee.role,
          });

          const first = yield* asActor(
            invitee,
            acceptTeamInvitation({ invitationId }),
          );
          const replay = yield* asActor(
            invitee,
            acceptTeamInvitation({ invitationId }),
          );

          assert.deepStrictEqual(replay, first);
          assert.strictEqual(first.teamId, teamId);
          assert.strictEqual(first.teamName, teamId);
          assert.strictEqual(first.role, 'admin');
          assert.strictEqual(first.status, 'accepted');

          assert.strictEqual(yield* invitationStatus(invitationId), 'accepted');
          const members = yield* memberRoles(teamId);
          assert.deepStrictEqual(
            members.filter(({ id }) => id === first.memberId),
            [{ id: first.memberId, role: 'admin' }],
          );

          // One event, not two: the replay changed nothing and must not put
          // the acceptance in the log twice.
          const events = yield* auditRows(teamId);
          assert.lengthOf(events, 1);
          assert.strictEqual(events[0]?.event_type, 'team.invitation.accepted');
          assert.strictEqual(events[0]?.actor_id, invitee.userId);
          assert.strictEqual(events[0]?.subject_id, invitationId);
          assert.strictEqual(events[0]?.subject_label, invitee.email);
          assert.deepStrictEqual(events[0]?.details, {
            role: 'admin',
            memberId: first.memberId,
          });
        }),
      { timeout: 30_000 },
    );

    suite.effect(
      'requires the matching verified account and a live pending invitation',
      () =>
        Effect.gen(function* () {
          const teamId = yield* seedTeam('command-accept-guards');
          const owner = identity(teamId, 'owner', 'owner');
          const invitee = identity(teamId, 'invitee', 'member');
          const wrongUser = identity(teamId, 'wrong-user', 'member');
          yield* seedIdentity(teamId, owner);
          yield* seedUser(invitee);
          yield* seedUser(wrongUser);
          const liveId = randomUUID();
          const expiredId = randomUUID();
          yield* seedInvitation({
            id: liveId,
            teamId,
            inviterId: owner.userId,
            email: invitee.email,
            role: 'member',
          });
          yield* seedInvitation({
            id: expiredId,
            teamId,
            inviterId: owner.userId,
            email: invitee.email,
            role: 'member',
            expiresAt: new Date(Date.now() - 60_000),
          });

          const refused = (
            who: Identity,
            invitationId: string,
            emailVerified = true,
          ) =>
            Effect.gen(function* () {
              const exit = yield* Effect.exit(
                asActor(who, acceptTeamInvitation({ invitationId }), {
                  emailVerified,
                }),
              );
              assert.isTrue(Exit.isFailure(exit));
              const error: unknown = Exit.isFailure(exit)
                ? Cause.squash(exit.cause)
                : undefined;
              assert.isTrue(
                error instanceof TeamCommandError && error.code === 'FORBIDDEN',
              );
            });

          yield* refused(wrongUser, liveId);
          yield* refused(invitee, liveId, false);
          yield* refused(invitee, expiredId);
          // An id no invitation carries: refused before any tenant is
          // resolved, so it leaves no event at all.
          yield* refused(invitee, randomUUID());

          const members = yield* memberRoles(teamId);
          assert.isUndefined(members.find(({ id }) => id === invitee.memberId));
          const events = yield* auditRows(teamId);
          assert.deepStrictEqual(
            events.map(({ actor_id, event_type, details }) => ({
              actor_id,
              event_type,
              details,
            })),
            [
              {
                actor_id: wrongUser.userId,
                event_type: 'team.invitation.acceptance_denied',
                details: { reason: 'email_mismatch' },
              },
              {
                actor_id: invitee.userId,
                event_type: 'team.invitation.acceptance_denied',
                details: { reason: 'email_unverified' },
              },
              {
                actor_id: invitee.userId,
                event_type: 'team.invitation.acceptance_denied',
                details: { reason: 'invitation_unavailable' },
              },
            ],
          );
        }),
      { timeout: 30_000 },
    );

    suite.effect(
      'uses the database clock when accepting an invitation from a lagging application host',
      () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const teamId = yield* seedTeam('command-accept-database-clock');
          const invitationId = randomUUID();
          const owner = identity(teamId, 'owner', 'owner');
          const invitee = identity(teamId, 'invitee', 'member');
          yield* seedIdentity(teamId, owner);
          yield* seedUser(invitee);
          yield* seedInvitation({
            id: invitationId,
            teamId,
            inviterId: owner.userId,
            email: invitee.email,
            role: invitee.role,
          });
          yield* harness.onOwner(
            harness.owner.sql`update team_invitations
                                 set expires_at = clock_timestamp()
                                                  - interval '1 minute'
                               where id = ${invitationId}`,
          );

          // An application host whose clock is years behind PostgreSQL. Both
          // clocks are moved: `Date.now` is what the limiter's window reads,
          // and the Effect `Clock` is what a `TestClock`-driven suite would
          // move — and neither may reach the invitation's liveness, which is
          // `expires_at > clock_timestamp()` inside the SELECT.
          //
          // Mutation: compare `expiresAt` against a JavaScript instant in
          // `team/store.ts`'s `lockInvitation` instead of computing `isLive` in
          // SQL. The acceptance then succeeds.
          const applicationClock = vi
            .spyOn(Date, 'now')
            .mockReturnValue(new Date('2000-01-01T00:00:00.000Z').getTime());
          const exit = yield* Effect.exit(
            asActor(invitee, acceptTeamInvitation({ invitationId })),
          ).pipe(
            Effect.ensuring(Effect.sync(() => applicationClock.mockRestore())),
          );

          assert.isTrue(Exit.isFailure(exit));
          const members = yield* memberRoles(teamId);
          assert.isUndefined(members.find(({ id }) => id === invitee.memberId));
          const events = yield* auditRows(teamId);
          assert.deepStrictEqual(
            events.map(({ outcome, details }) => ({ outcome, details })),
            [
              {
                outcome: 'denied',
                details: { reason: 'invitation_unavailable' },
              },
            ],
          );
        }),
      { timeout: 30_000 },
    );

    suite.effect.skipIf(!deniedAuditWindow)(
      'rate-limits immutable wrong-account denial events before the team lock',
      () =>
        Effect.gen(function* () {
          const teamId = yield* seedTeam('command-accept-denial-limit');
          const invitationId = randomUUID();
          const owner = identity(teamId, 'owner', 'owner');
          const invitee = identity(teamId, 'invitee', 'member');
          const wrongUser = identity(teamId, 'wrong-user', 'member');
          yield* seedIdentity(teamId, owner);
          yield* seedUser(invitee);
          yield* seedUser(wrongUser);
          yield* seedInvitation({
            id: invitationId,
            teamId,
            inviterId: owner.userId,
            email: invitee.email,
            role: invitee.role,
          });

          for (let attempt = 0; attempt < 6; attempt += 1) {
            const exit = yield* Effect.exit(
              asActor(wrongUser, acceptTeamInvitation({ invitationId })),
            );
            assert.isTrue(Exit.isFailure(exit));
          }

          const events = yield* auditRows(teamId);
          assert.lengthOf(
            events.filter(
              ({ actor_id, event_type }) =>
                actor_id === wrongUser.userId &&
                event_type === 'team.invitation.acceptance_denied',
            ),
            5,
          );
        }),
      { timeout: 60_000 },
    );

    const failedAcceptance = [
      {
        label: 'invalid invitation role',
        errorCode: 'INVALID_ROLE' as const,
        failureCode: 'invalid_role',
        corruptRole: 'corrupt',
        seedMember: false,
      },
      {
        label: 'legacy multi-role invitation',
        errorCode: 'INVALID_ROLE' as const,
        failureCode: 'invalid_role',
        corruptRole: 'admin,member',
        seedMember: false,
      },
      {
        label: 'existing membership conflict',
        errorCode: 'CONFLICT' as const,
        failureCode: 'conflict',
        corruptRole: null,
        seedMember: true,
      },
    ];

    for (const scenario of failedAcceptance) {
      suite.effect(
        `records an immutable failed event for an authorized ${scenario.label}`,
        () =>
          Effect.gen(function* () {
            const harness = yield* TestDatabase;
            const teamId = yield* seedTeam(
              `command-accept-failed-${scenario.label.replaceAll(' ', '-')}`,
            );
            const invitationId = randomUUID();
            const owner = identity(teamId, 'owner', 'owner');
            const invitee = identity(teamId, 'invitee', 'member');
            yield* seedIdentity(teamId, owner);
            yield* seedInvitation({
              id: invitationId,
              teamId,
              inviterId: owner.userId,
              email: invitee.email,
              role: invitee.role,
            });
            if (scenario.corruptRole !== null) {
              yield* harness.onOwner(
                harness.owner.sql`update team_invitations
                                     set role = ${scenario.corruptRole}
                                   where team_id = ${teamId}
                                     and id = ${invitationId}`,
              );
            }
            if (scenario.seedMember) {
              yield* seedIdentity(teamId, invitee);
            } else {
              yield* seedUser(invitee);
            }

            const exit = yield* Effect.exit(
              asActor(invitee, acceptTeamInvitation({ invitationId })),
            );
            assert.isTrue(Exit.isFailure(exit));
            const error: unknown = Exit.isFailure(exit)
              ? Cause.squash(exit.cause)
              : undefined;
            assert.isTrue(
              error instanceof TeamCommandError &&
                error.code === scenario.errorCode,
            );

            const events = yield* auditRows(teamId);
            assert.deepStrictEqual(
              events.map(({ event_type, outcome, subject_id, details }) => ({
                event_type,
                outcome,
                subject_id,
                details,
              })),
              [
                {
                  event_type: 'team.invitation.acceptance_failed',
                  outcome: 'failed',
                  subject_id: null,
                  details: { failureCode: scenario.failureCode },
                },
              ],
            );
            // The domain write is undone and the invitation is untouched:
            // the failure event commits, the mutation does not.
            const members = yield* memberRoles(teamId);
            assert.lengthOf(
              members.filter(({ id }) => id === invitee.memberId),
              scenario.seedMember ? 1 : 0,
            );
            assert.strictEqual(
              yield* invitationStatus(invitationId),
              'pending',
            );
          }),
        { timeout: 30_000 },
      );
    }

    suite.effect(
      'serializes concurrent acceptance into one membership and one event',
      () =>
        Effect.gen(function* () {
          const teamId = yield* seedTeam('command-concurrent-accept');
          const invitationId = randomUUID();
          const owner = identity(teamId, 'owner', 'owner');
          const invitee = identity(teamId, 'invitee', 'member');
          yield* seedIdentity(teamId, owner);
          yield* seedUser(invitee);
          yield* seedInvitation({
            id: invitationId,
            teamId,
            inviterId: owner.userId,
            email: invitee.email,
            role: invitee.role,
          });

          const [first, second] = yield* Effect.all(
            [
              asActor(invitee, acceptTeamInvitation({ invitationId })),
              asContender(invitee, acceptTeamInvitation({ invitationId })),
            ],
            { concurrency: 'unbounded' },
          );

          assert.deepStrictEqual(second, first);
          const members = yield* memberRoles(teamId);
          assert.lengthOf(
            members.filter(({ id }) => id === first.memberId),
            1,
          );
          const events = yield* auditRows(teamId);
          assert.lengthOf(
            events.filter(
              ({ event_type }) => event_type === 'team.invitation.accepted',
            ),
            1,
          );
        }),
      { timeout: 60_000 },
    );

    // -----------------------------------------------------------------------
    // Role changes
    // -----------------------------------------------------------------------

    suite.effect(
      'changes a role with exact actor, target, before/after, and request context',
      () =>
        Effect.gen(function* () {
          const teamId = yield* seedTeam('command-role-success');
          const owner = identity(teamId, 'owner', 'owner');
          const member = identity(teamId, 'member', 'member');
          yield* seedIdentity(teamId, owner);
          yield* seedIdentity(teamId, member);
          const requestId = randomUUID();

          const updated = yield* asActor(
            owner,
            updateTeamMemberRole(access(teamId), {
              memberId: member.memberId,
              role: 'admin',
            }),
            { requestId },
          );
          assert.deepStrictEqual(updated, {
            memberId: member.memberId,
            role: 'admin',
          });

          const members = yield* memberRoles(teamId);
          assert.strictEqual(
            members.find(({ id }) => id === member.memberId)?.role,
            'admin',
          );
          const events = yield* auditRows(teamId);
          assert.lengthOf(events, 1);
          const event = events[0]!;
          assert.strictEqual(event.event_type, 'team.member.role_changed');
          assert.strictEqual(event.event_version, 1);
          assert.strictEqual(event.outcome, 'succeeded');
          assert.strictEqual(event.actor_id, owner.userId);
          assert.strictEqual(event.actor_label, owner.name);
          assert.strictEqual(event.subject_id, member.memberId);
          assert.strictEqual(event.subject_label, member.name);
          assert.strictEqual(event.request_id, requestId);
          assert.deepStrictEqual(event.details, {
            previousRoles: ['member'],
            newRoles: ['admin'],
          });
        }),
      { timeout: 30_000 },
    );

    suite.effect(
      'snapshots the locked team label instead of joining a later rename',
      () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const teamId = yield* seedTeam(
            'command-team-label',
            'Original Research Team',
          );
          const owner = identity(teamId, 'owner', 'owner');
          yield* seedIdentity(teamId, owner);

          yield* asActor(
            owner,
            createTeamInvitation(access(teamId), {
              email: 'team-label@example.com',
              role: 'member',
            }),
          );
          yield* harness.onOwner(
            harness.owner.sql`update teams set name = 'Renamed Research Team'
                               where id = ${teamId}`,
          );

          const events = yield* auditRows(teamId);
          assert.deepStrictEqual(
            events.map(({ team_label }) => team_label),
            ['Original Research Team'],
          );
        }),
      { timeout: 30_000 },
    );

    suite.effect(
      'takes the team audit lock before command work begins',
      () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const teamId = yield* seedTeam('command-prework-lock');
          const owner = identity(teamId, 'owner', 'owner');
          yield* seedIdentity(teamId, owner);

          const started = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const command = yield* Effect.forkChild(
            asActor(
              owner,
              audited(
                'team.updateMemberRole',
                access(teamId),
                Effect.gen(function* () {
                  yield* Deferred.succeed(started, undefined);
                  yield* Deferred.await(release);
                  return changed(undefined, [
                    {
                      eventType: 'team.invitation.created',
                      eventVersion: 1,
                      category: 'team_access',
                      subjectType: 'team_invitation',
                      subjectId: randomUUID(),
                      subjectLabel: 'serialized@example.com',
                      resourceType: null,
                      resourceId: null,
                      resourceLabel: null,
                      details: { role: 'member' },
                    },
                  ]);
                }),
              ),
            ),
          );
          yield* Deferred.await(started);

          // A second connection cannot take the same key while the body is
          // still running, which is what "before command work begins" means:
          // the lock is taken outside the savepoint, before the body runs at
          // all.
          //
          // Mutation: move `lockTeam` inside the savepoint in `audit/audited.ts`
          // — this still passes, because the lock is held either way. Move it
          // AFTER the body and it fails, which is the ordering this asserts.
          const contender = yield* harness.onOwner(
            harness.owner.sql.unsafe<{ acquired: boolean }>(
              `select pg_try_advisory_xact_lock(${AUDIT_TEAM_LOCK_KEY_SQL}) as acquired`,
              [teamId, AUDIT_SEQUENCE_LOCK_SEED.toString()],
            ),
          );
          assert.deepStrictEqual(contender, [{ acquired: false }]);

          yield* Deferred.succeed(release, undefined);
          yield* Fiber.join(command);
          assert.lengthOf(yield* auditRows(teamId), 1);
        }),
      { timeout: 30_000 },
    );

    suite.effect(
      're-authorizes an actor after waiting for the team audit lock',
      () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const teamId = yield* seedTeam('command-actor-revoked');
          const owner = identity(teamId, 'owner', 'owner');
          const admin = identity(teamId, 'admin', 'admin');
          yield* seedIdentity(teamId, owner);
          yield* seedIdentity(teamId, admin);

          const held = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          // The holder takes the team's audit lock and demotes the admin, then
          // waits: everything the command is about to re-read is already
          // changed, but not yet visible, and the lock is what makes it wait.
          const holder = yield* Effect.forkChild(
            harness.onOwner(
              Effect.gen(function* () {
                yield* harness.owner.sql.unsafe(
                  `select pg_advisory_xact_lock(${AUDIT_TEAM_LOCK_KEY_SQL})`,
                  [teamId, AUDIT_SEQUENCE_LOCK_SEED.toString()],
                );
                yield* harness.owner.sql`update team_members set role = 'member'
                      where id = ${admin.memberId}`;
                yield* Deferred.succeed(held, undefined);
                yield* Deferred.await(release);
              }),
            ),
          );
          yield* Deferred.await(held);

          const command = yield* Effect.forkChild(
            asContender(
              admin,
              createTeamInvitation(access(teamId, 'admin'), {
                email: 'must-not-land@example.com',
                role: 'member',
              }),
            ),
          );
          // The command is blocked on the advisory lock — a real signal, polled,
          // rather than a sleep: `pg_locks` reports an ungranted advisory lock
          // exactly while somebody is waiting for one.
          yield* waitUntilBlocked(harness);
          yield* Deferred.succeed(release, undefined);
          yield* Fiber.join(holder);

          const exit = yield* Fiber.await(command);
          assert.isTrue(Exit.isFailure(exit));
          const error: unknown = Exit.isFailure(exit)
            ? Cause.squash(exit.cause)
            : undefined;
          assert.isTrue(
            error instanceof TeamCommandError && error.code === 'FORBIDDEN',
          );
          const invitations = yield* harness.onOwner(
            harness.owner.sql<{
              id: string;
            }>`select id from team_invitations where team_id = ${teamId}`,
          );
          assert.lengthOf(invitations, 0);
        }),
      { timeout: 60_000 },
    );

    suite.effect(
      'stamps the trusted actor context over anything a caller supplied',
      () =>
        Effect.gen(function* () {
          const teamId = yield* seedTeam('command-event-context');
          const owner = identity(teamId, 'owner', 'owner');
          yield* seedIdentity(teamId, owner);

          // The runtime half of the two compile assertions at the top of this
          // file. Built through a variable rather than as a fresh literal,
          // because TypeScript's excess-property check only fires on a literal
          // — which is exactly the shape a forged body would arrive in.
          const forged: AuditEventBody = {
            eventType: 'team.invitation.created',
            eventVersion: 1,
            category: 'team_access',
            subjectType: 'team_invitation',
            subjectId: randomUUID(),
            subjectLabel: 'context-check@example.com',
            resourceType: null,
            resourceId: null,
            resourceLabel: null,
            details: { role: 'member' },
          };
          const forgery: Record<string, unknown> = {
            teamId: 'forged-team',
            teamLabel: 'Forged Team',
            actorKind: 'api_token',
            actorId: 'forged-actor',
            actorLabel: 'Forged Actor',
            requestId: 'forged-request',
            outcome: 'denied',
          };
          Object.assign(forged, forgery);
          // A real request id, because `stamp` parses what it builds against
          // the registry's own schema — which is the second check behind the
          // combinator, and would refuse a made-up one before the assertions
          // below could read it.
          const requestId = randomUUID();
          const context = AuditContext.of({
            teamId,
            teamLabel: 'Locked Team',
            actorId: owner.userId,
            actorLabel: owner.name,
            requestId,
          });

          const stamped = stamp(context, forged, 'succeeded');

          // Every field the combinator owns comes from the context, whatever
          // the body carried — which is why there is no assertion left to
          // refuse a mismatch: there is no mismatch to have.
          assert.strictEqual(stamped.teamId, teamId);
          assert.strictEqual(stamped.teamLabel, 'Locked Team');
          assert.strictEqual(stamped.actorKind, 'user');
          assert.strictEqual(stamped.actorId, owner.userId);
          assert.strictEqual(stamped.actorLabel, owner.name);
          assert.strictEqual(stamped.requestId, requestId);
          assert.strictEqual(stamped.outcome, 'succeeded');

          // And the outcome comes from the DECISION, not from the body — twice
          // over. A denial event stamps `denied`:
          const deniedBody: AuditEventBody = {
            eventType: 'team.invitation.creation_denied',
            eventVersion: 1,
            category: 'team_access',
            subjectType: null,
            subjectId: null,
            subjectLabel: null,
            resourceType: null,
            resourceId: null,
            resourceLabel: null,
            details: {
              requestedRole: 'owner',
              reason: 'owner_role_requires_owner',
            },
          };
          Object.assign(deniedBody, { outcome: 'succeeded' });
          assert.strictEqual(
            stamp(context, deniedBody, 'denied').outcome,
            'denied',
          );
          // …and the registry refuses the pairing outright rather than taking
          // the body's word for it: `team.invitation.created` has no denied
          // form, so stamping it as one cannot produce a row at all.
          assert.throws(() => stamp(context, forged, 'denied'));

          assert.lengthOf(yield* auditRows(teamId), 0);
        }),
      { timeout: 30_000 },
    );

    suite.effect(
      'preserves owner and manager authorization invariants',
      () =>
        Effect.gen(function* () {
          const teamId = yield* seedTeam('command-role-rules');
          const owner = identity(teamId, 'owner', 'owner');
          const admin = identity(teamId, 'admin', 'admin');
          const member = identity(teamId, 'member', 'member');
          const ordinary = identity(teamId, 'ordinary', 'member');
          for (const person of [owner, admin, member, ordinary]) {
            yield* seedIdentity(teamId, person);
          }

          assert.deepStrictEqual(
            yield* asActor(
              admin,
              updateTeamMemberRole(access(teamId, 'admin'), {
                memberId: member.memberId,
                role: 'admin',
              }),
            ),
            { memberId: member.memberId, role: 'admin' },
          );
          yield* expectForbidden(
            asActor(
              admin,
              updateTeamMemberRole(access(teamId, 'admin'), {
                memberId: owner.memberId,
                role: 'member',
              }),
            ),
          );
          yield* expectForbidden(
            asActor(
              admin,
              updateTeamMemberRole(access(teamId, 'admin'), {
                memberId: member.memberId,
                role: 'owner',
              }),
            ),
          );
          yield* expectForbidden(
            asActor(
              ordinary,
              createTeamInvitation(access(teamId, 'member'), {
                email: 'forbidden@example.com',
                role: 'member',
              }),
            ),
          );

          const events = yield* auditRows(teamId);
          assert.deepStrictEqual(
            events
              .filter(
                ({ event_type }) =>
                  event_type === 'team.invitation.creation_denied',
              )
              .map(({ outcome, subject_id, subject_label, details }) => ({
                outcome,
                subject_id,
                subject_label,
                details,
              })),
            [
              {
                outcome: 'denied',
                subject_id: null,
                subject_label: null,
                details: {
                  requestedRole: 'member',
                  reason: 'insufficient_permission',
                },
              },
            ],
          );
        }),
      { timeout: 30_000 },
    );

    suite.effect(
      'commits an immutable denial event before refusing role escalation',
      () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const teamId = yield* seedTeam('command-role-denied');
          const owner = identity(teamId, 'owner', 'owner');
          const admin = identity(teamId, 'admin', 'admin');
          const member = identity(teamId, 'member', 'member');
          for (const person of [owner, admin, member]) {
            yield* seedIdentity(teamId, person);
          }
          const requestId = randomUUID();

          yield* expectForbidden(
            asActor(
              admin,
              updateTeamMemberRole(access(teamId, 'admin'), {
                memberId: member.memberId,
                role: 'owner',
              }),
              { requestId },
            ),
          );

          const members = yield* memberRoles(teamId);
          assert.strictEqual(
            members.find(({ id }) => id === member.memberId)?.role,
            'member',
          );
          const events = yield* auditRows(teamId);
          assert.lengthOf(events, 1);
          const denied = events[0]!;
          assert.strictEqual(denied.outcome, 'denied');
          assert.strictEqual(
            denied.event_type,
            'team.member.role_change_denied',
          );
          assert.strictEqual(denied.actor_id, admin.userId);
          assert.strictEqual(denied.subject_id, member.memberId);
          assert.strictEqual(denied.request_id, requestId);
          assert.deepStrictEqual(denied.details, {
            requestedRoles: ['owner'],
            reason: 'owner_role_requires_owner',
          });

          // Committed AND immutable: the row the caller never saw cannot be
          // edited away afterwards.
          const amended = yield* Effect.exit(
            harness.onOwner(
              harness.owner.sql`update audit_events set outcome = 'succeeded'
                                 where id = ${denied.id}`,
            ),
          );
          assert.isTrue(Exit.isFailure(amended));
        }),
      { timeout: 30_000 },
    );

    suite.effect(
      'commits an immutable denial event before refusing an owner invitation from an admin',
      () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const teamId = yield* seedTeam('command-owner-invitation-denied');
          const admin = identity(teamId, 'admin', 'admin');
          yield* seedIdentity(teamId, admin);
          const requestId = randomUUID();
          yield* clearRecorded();

          yield* expectForbidden(
            asActor(
              admin,
              createTeamInvitation(access(teamId, 'admin'), {
                email: 'prospective-owner@example.com',
                role: 'owner',
              }),
              { requestId },
            ),
          );

          const invitations = yield* harness.onOwner(
            harness.owner.sql<{
              id: string;
            }>`select id from team_invitations where team_id = ${teamId}`,
          );
          assert.lengthOf(invitations, 0);
          const deliveries = yield* harness.onOwner(
            harness.owner.sql<{
              invitation_id: string;
            }>`select invitation_id from team_invitation_deliveries
                where team_id = ${teamId}`,
          );
          assert.lengthOf(deliveries, 0);
          // And no job: the enqueue is inside the transaction the denial
          // rolled back, so a refused invitation cannot leave one behind.
          assert.lengthOf(yield* recorded(), 0);

          const events = yield* auditRows(teamId);
          assert.lengthOf(events, 1);
          const denied = events[0]!;
          assert.strictEqual(denied.outcome, 'denied');
          assert.strictEqual(
            denied.event_type,
            'team.invitation.creation_denied',
          );
          assert.strictEqual(denied.actor_id, admin.userId);
          assert.isNull(denied.subject_id);
          assert.isNull(denied.subject_label);
          assert.strictEqual(denied.request_id, requestId);
          assert.deepStrictEqual(denied.details, {
            requestedRole: 'owner',
            reason: 'owner_role_requires_owner',
          });

          const deleted = yield* Effect.exit(
            harness.onOwner(
              harness.owner
                .sql`delete from audit_events where id = ${denied.id}`,
            ),
          );
          assert.isTrue(Exit.isFailure(deleted));
        }),
      { timeout: 30_000 },
    );

    suite.effect.skipIf(!deniedAuditWindow)(
      'bounds repeated denied owner invitations before starting another team transaction',
      () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const teamId = yield* seedTeam(
            'command-owner-invitation-denial-limit',
          );
          const admin = identity(teamId, 'admin', 'admin');
          yield* seedIdentity(teamId, admin);

          for (let attempt = 0; attempt < 6; attempt += 1) {
            yield* expectForbidden(
              asActor(
                admin,
                createTeamInvitation(access(teamId, 'admin'), {
                  email: `prospective-owner-${attempt}@example.com`,
                  role: 'owner',
                }),
              ),
            );
          }

          // Five events, not six: the sixth attempt was refused before any
          // transaction opened, which is the whole point of taking the slot
          // ahead of the scope.
          const events = yield* auditRows(teamId);
          assert.lengthOf(
            events.filter(
              ({ event_type }) =>
                event_type === 'team.invitation.creation_denied',
            ),
            5,
          );
          const invitations = yield* harness.onOwner(
            harness.owner.sql<{
              id: string;
            }>`select id from team_invitations where team_id = ${teamId}`,
          );
          assert.lengthOf(invitations, 0);
        }),
      { timeout: 60_000 },
    );

    suite.effect(
      'does not reject or misclassify a concurrent authorized invitation burst',
      () =>
        Effect.gen(function* () {
          const teamId = yield* seedTeam('command-authorized-invitation-burst');
          const owner = identity(teamId, 'owner', 'owner');
          yield* seedIdentity(teamId, owner);
          yield* clearRecorded();

          const results = yield* Effect.all(
            Array.from({ length: 6 }, (_, attempt) =>
              asActor(
                owner,
                createTeamInvitation(access(teamId), {
                  email: `authorized-burst-${attempt}@example.com`,
                  role: 'member',
                }),
              ),
            ),
            { concurrency: 'unbounded' },
          );

          assert.lengthOf(results, 6);
          assert.strictEqual(
            new Set(results.map(({ invitationId }) => invitationId)).size,
            6,
          );
          const events = yield* auditRows(teamId);
          assert.deepStrictEqual(
            events.map(({ event_type, outcome }) => ({ event_type, outcome })),
            Array.from({ length: 6 }, () => ({
              event_type: 'team.invitation.created',
              outcome: 'succeeded',
            })),
          );
          // One job per invitation, identifiers only.
          const jobs = yield* recorded();
          assert.lengthOf(jobs, 6);
          for (const job of jobs) {
            assert.strictEqual(job.queue, 'invitation-delivery');
            assert.deepStrictEqual(
              Object.keys(job.payload as Record<string, unknown>),
              ['deliveryId'],
            );
          }
        }),
      { timeout: 60_000 },
    );

    suite.effect(
      'records an established member denial without exposing the requested invitation',
      () =>
        Effect.gen(function* () {
          const teamId = yield* seedTeam(
            'command-invitation-cancellation-denied',
          );
          const owner = identity(teamId, 'owner', 'owner');
          const member = identity(teamId, 'member', 'member');
          yield* seedIdentity(teamId, owner);
          yield* seedIdentity(teamId, member);
          const invitationId = randomUUID();
          yield* seedInvitation({
            id: invitationId,
            teamId,
            inviterId: owner.userId,
            email: 'invitee-to-protect@example.com',
            role: 'member',
          });
          const requestId = randomUUID();

          yield* expectForbidden(
            asActor(
              member,
              cancelTeamInvitation(access(teamId, 'member'), { invitationId }),
              { requestId },
            ),
          );

          assert.strictEqual(yield* invitationStatus(invitationId), 'pending');
          const events = yield* auditRows(teamId);
          assert.deepStrictEqual(
            events.map(
              ({
                event_type,
                outcome,
                subject_id,
                subject_label,
                request_id,
                details,
              }) => ({
                event_type,
                outcome,
                subject_id,
                subject_label,
                request_id,
                details,
              }),
            ),
            [
              {
                event_type: 'team.invitation.cancellation_denied',
                outcome: 'denied',
                // The refusal names no invitation: a member who cannot cancel
                // must not learn which one they asked about.
                subject_id: null,
                subject_label: null,
                request_id: requestId,
                details: { reason: 'insufficient_permission' },
              },
            ],
          );
        }),
      { timeout: 30_000 },
    );

    suite.effect.skipIf(!deniedAuditWindow)(
      'bounds repeated denied role-change events before starting another team transaction',
      () =>
        Effect.gen(function* () {
          const teamId = yield* seedTeam('command-role-denied-rate-limit');
          const owner = identity(teamId, 'owner', 'owner');
          const member = identity(teamId, 'member', 'member');
          yield* seedIdentity(teamId, owner);
          yield* seedIdentity(teamId, member);

          for (let attempt = 0; attempt < 6; attempt += 1) {
            yield* expectForbidden(
              asActor(
                member,
                updateTeamMemberRole(access(teamId, 'member'), {
                  memberId: owner.memberId,
                  role: 'member',
                }),
              ),
            );
          }

          const events = yield* auditRows(teamId);
          assert.lengthOf(
            events.filter(
              ({ event_type }) =>
                event_type === 'team.member.role_change_denied',
            ),
            5,
          );
        }),
      { timeout: 60_000 },
    );

    suite.effect(
      'records a bounded failure for last-owner rejection without a false success event',
      () =>
        Effect.gen(function* () {
          const teamId = yield* seedTeam('command-last-owner');
          const owner = identity(teamId, 'owner', 'owner');
          yield* seedIdentity(teamId, owner);

          yield* expectCode(
            asActor(
              owner,
              updateTeamMemberRole(access(teamId), {
                memberId: owner.memberId,
                role: 'member',
              }),
            ),
            'LAST_OWNER',
          );
          yield* expectCode(
            asActor(
              owner,
              updateTeamMemberRole(access(teamId), {
                memberId: owner.memberId,
                role: 'owner',
              }),
            ),
            'NO_CHANGE',
          );

          // The positive oracle: the team is still workable afterwards, and
          // the failure event did not take the transaction's other writes with
          // it.
          const positive = yield* asActor(
            owner,
            createTeamInvitation(access(teamId), {
              email: 'positive-oracle@example.com',
              role: 'member',
            }),
          );
          assert.strictEqual(positive.status, 'pending');

          const members = yield* memberRoles(teamId);
          assert.strictEqual(
            members.find(({ id }) => id === owner.memberId)?.role,
            'owner',
          );
          const events = yield* auditRows(teamId);
          assert.deepStrictEqual(
            events.map(({ event_type, outcome, subject_id, details }) => ({
              event_type,
              outcome,
              subject_id,
              details,
            })),
            [
              {
                event_type: 'team.member.role_change_failed',
                outcome: 'failed',
                subject_id: null,
                details: { failureCode: 'last_owner' },
              },
              {
                event_type: 'team.invitation.created',
                outcome: 'succeeded',
                subject_id: positive.invitationId,
                details: { role: 'member' },
              },
            ],
          );
        }),
      { timeout: 30_000 },
    );

    suite.effect(
      'rolls a classified domain mutation back before committing its failure event',
      () =>
        Effect.gen(function* () {
          const teamId = yield* seedTeam('command-domain-savepoint');
          const owner = identity(teamId, 'owner', 'owner');
          yield* seedIdentity(teamId, owner);

          const exit = yield* Effect.exit(
            asActor(
              owner,
              audited(
                'team.updateMemberRole',
                access(teamId),
                Effect.gen(function* () {
                  const { sql } = yield* Transaction;
                  yield* sql`update team_members set role = 'member'
                              where id = ${owner.memberId}`;
                  return yield* Effect.fail(
                    auditable(new TeamCommandError({ code: 'LAST_OWNER' }), {
                      outcome: 'failed',
                      events: [
                        {
                          eventType: 'team.member.role_change_failed',
                          eventVersion: 1,
                          category: 'team_access',
                          subjectType: null,
                          subjectId: null,
                          subjectLabel: null,
                          resourceType: null,
                          resourceId: null,
                          resourceLabel: null,
                          details: { failureCode: 'last_owner' },
                        },
                      ],
                    }),
                  );
                }),
              ),
            ),
          );
          assert.isTrue(Exit.isFailure(exit));

          // The write is gone and the record is not: the savepoint rolled
          // back, and the outer transaction committed the event after it.
          const members = yield* memberRoles(teamId);
          assert.strictEqual(
            members.find(({ id }) => id === owner.memberId)?.role,
            'owner',
          );
          const events = yield* auditRows(teamId);
          assert.deepStrictEqual(
            events.map(({ event_type, outcome, details }) => ({
              event_type,
              outcome,
              details,
            })),
            [
              {
                event_type: 'team.member.role_change_failed',
                outcome: 'failed',
                details: { failureCode: 'last_owner' },
              },
            ],
          );
        }),
      { timeout: 30_000 },
    );

    suite.effect(
      'keeps one owner when two owners concurrently demote themselves',
      () =>
        Effect.gen(function* () {
          const teamId = yield* seedTeam('command-concurrent-owners');
          const first = identity(teamId, 'first-owner', 'owner');
          const second = identity(teamId, 'second-owner', 'owner');
          yield* seedIdentity(teamId, first);
          yield* seedIdentity(teamId, second);

          const outcomes = yield* Effect.all(
            [
              Effect.exit(
                asActor(
                  first,
                  updateTeamMemberRole(access(teamId), {
                    memberId: first.memberId,
                    role: 'member',
                  }),
                ),
              ),
              Effect.exit(
                asContender(
                  second,
                  updateTeamMemberRole(access(teamId), {
                    memberId: second.memberId,
                    role: 'member',
                  }),
                ),
              ),
            ],
            { concurrency: 'unbounded' },
          );
          assert.lengthOf(outcomes.filter(Exit.isSuccess), 1);
          const failures = outcomes.filter(Exit.isFailure);
          assert.lengthOf(failures, 1);
          const error: unknown = Cause.squash(failures[0]!.cause);
          assert.isTrue(
            error instanceof TeamCommandError && error.code === 'LAST_OWNER',
          );

          const members = yield* memberRoles(teamId);
          assert.lengthOf(
            members.filter(({ role }) => role === 'owner'),
            1,
          );
          assert.lengthOf(
            members.filter(({ role }) => role === 'member'),
            1,
          );
          const events = yield* auditRows(teamId);
          assert.deepStrictEqual(
            events.map(({ sequence, event_type, outcome, details }) => ({
              sequence,
              event_type,
              outcome,
              details,
            })),
            [
              {
                sequence: '1',
                event_type: 'team.member.role_changed',
                outcome: 'succeeded',
                details: { previousRoles: ['owner'], newRoles: ['member'] },
              },
              {
                sequence: '2',
                event_type: 'team.member.role_change_failed',
                outcome: 'failed',
                details: { failureCode: 'last_owner' },
              },
            ],
          );
        }),
      { timeout: 60_000 },
    );

    // -----------------------------------------------------------------------
    // Invitation creation and cancellation
    // -----------------------------------------------------------------------

    suite.effect(
      'creates and cancels an invitation without recording secret material',
      () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const teamId = yield* seedTeam('command-invitations');
          const owner = identity(teamId, 'owner', 'owner');
          yield* seedIdentity(teamId, owner);
          yield* clearRecorded();

          const created = yield* asActor(
            owner,
            createTeamInvitation(access(teamId), {
              email: 'Invitee@Example.com',
              role: 'admin',
            }),
          );
          assert.strictEqual(created.email, 'invitee@example.com');
          assert.strictEqual(created.role, 'admin');
          assert.strictEqual(created.status, 'pending');
          // The lifetime is the database's arithmetic on the database's
          // clock, so it lands 48 hours from now however this host's clock is
          // set.
          assert.isAbove(
            created.expiresAt.getTime(),
            Date.now() + 47 * 60 * 60 * 1000,
          );
          assert.isBelow(
            created.expiresAt.getTime(),
            Date.now() + 49 * 60 * 60 * 1000,
          );

          const delivery = yield* harness.onOwner(
            harness.owner.sql<{
              email: string;
              role: string;
              team_label: string;
              inviter_label: string;
            }>`select email, role, team_label, inviter_label
                 from team_invitation_deliveries
                where invitation_id = ${created.invitationId}`,
          );
          assert.deepStrictEqual(delivery, [
            {
              email: 'invitee@example.com',
              role: 'admin',
              team_label: teamId,
              inviter_label: owner.name,
            },
          ]);
          // Exactly one job, identifiers only, and in the same transaction —
          // the recorded enqueue requires `Transaction`, so its presence is
          // what says the scope was open.
          const jobs = yield* recorded();
          assert.lengthOf(jobs, 1);
          assert.strictEqual(jobs[0]?.queue, 'invitation-delivery');
          assert.deepStrictEqual(
            Object.keys(jobs[0]?.payload as Record<string, unknown>),
            ['deliveryId'],
          );

          yield* expectCode(
            asActor(
              owner,
              createTeamInvitation(access(teamId), {
                email: 'invitee@example.com',
                role: 'member',
              }),
            ),
            'CONFLICT',
          );

          assert.deepStrictEqual(
            yield* asActor(
              owner,
              cancelTeamInvitation(access(teamId), {
                invitationId: created.invitationId,
              }),
            ),
            { invitationId: created.invitationId, status: 'canceled' },
          );
          assert.strictEqual(
            yield* invitationStatus(created.invitationId),
            'canceled',
          );

          const events = yield* auditRows(teamId);
          assert.deepStrictEqual(
            events.map(({ event_type, subject_label, details }) => ({
              event_type,
              subject_label,
              details,
            })),
            [
              {
                event_type: 'team.invitation.created',
                subject_label: 'invitee@example.com',
                details: { role: 'admin' },
              },
              {
                event_type: 'team.invitation.cancelled',
                subject_label: 'invitee@example.com',
                details: { roles: ['admin'] },
              },
            ],
          );
          assert.notMatch(
            JSON.stringify(events),
            /token|magic|password|requestBody/i,
          );
        }),
      { timeout: 30_000 },
    );

    suite.effect(
      'cancels and completely audits a legacy multi-role invitation',
      () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const teamId = yield* seedTeam('command-cancel-legacy-multi-role');
          const invitationId = randomUUID();
          const owner = identity(teamId, 'owner', 'owner');
          const invitee = identity(teamId, 'invitee', 'member');
          yield* seedIdentity(teamId, owner);
          yield* seedInvitation({
            id: invitationId,
            teamId,
            inviterId: owner.userId,
            email: invitee.email,
            role: invitee.role,
          });
          yield* harness.onOwner(
            harness.owner.sql`update team_invitations set role = 'admin,member'
                             where team_id = ${teamId} and id = ${invitationId}`,
          );

          assert.deepStrictEqual(
            yield* asActor(
              owner,
              cancelTeamInvitation(access(teamId), { invitationId }),
            ),
            { invitationId, status: 'canceled' },
          );

          const events = yield* auditRows(teamId);
          assert.deepStrictEqual(
            events.map(({ event_type, event_version, details }) => ({
              event_type,
              event_version,
              details,
            })),
            [
              {
                event_type: 'team.invitation.cancelled',
                event_version: 2,
                details: { roles: ['admin', 'member'] },
              },
            ],
          );
        }),
      { timeout: 30_000 },
    );

    // -----------------------------------------------------------------------
    // The required append
    // -----------------------------------------------------------------------

    const refusingAuditInsert = Effect.fnUntraced(function* (name: string) {
      const harness = yield* TestDatabase;
      yield* harness.onOwner(
        harness.owner.sql.unsafe(`
          create or replace function ${name}() returns trigger as $refuse$
          begin raise exception '${name} rejected'; end;
          $refuse$ language plpgsql`),
      );
      yield* harness.onOwner(
        harness.owner.sql.unsafe(`
          create or replace trigger ${name}
            before insert on audit_events
            for each row execute function ${name}()`),
      );
      return Effect.orDie(
        harness.onOwner(
          harness.owner.sql.unsafe(`drop trigger ${name} on audit_events`),
        ),
      );
    });

    suite.effect(
      'rolls the member update back when the audit insert fails',
      () =>
        Effect.gen(function* () {
          const teamId = yield* seedTeam('command-audit-failure');
          const owner = identity(teamId, 'owner', 'owner');
          const member = identity(teamId, 'member', 'member');
          yield* seedIdentity(teamId, owner);
          yield* seedIdentity(teamId, member);
          const requestId = randomUUID();
          yield* clearRecorded();

          const drop = yield* refusingAuditInsert('refuse_success_append');
          const exit = yield* Effect.exit(
            asActor(
              owner,
              updateTeamMemberRole(access(teamId), {
                memberId: member.memberId,
                role: 'admin',
              }),
              { requestId },
            ),
          ).pipe(Effect.ensuring(drop));
          assert.isTrue(Exit.isFailure(exit));

          // The operator is told, and read from a recorded signal rather than a
          // spy on `process`, which is a global and therefore order-dependent.
          const recordedSignals = yield* Effect.flatMap(
            RecordedSignals,
            (recorder) => recorder.signals,
          );
          assert.deepStrictEqual(
            recordedSignals.map(({ code }) => code),
            ['STUDIO_AUDIT_APPEND_FAILED'],
          );
          assert.deepStrictEqual(
            {
              eventType: recordedSignals[0]?.detail.eventType,
              eventVersion: recordedSignals[0]?.detail.eventVersion,
              outcome: recordedSignals[0]?.detail.outcome,
              teamId: recordedSignals[0]?.detail.teamId,
              requestId: recordedSignals[0]?.detail.requestId,
            },
            {
              eventType: 'team.member.role_changed',
              eventVersion: 1,
              outcome: 'succeeded',
              teamId,
              requestId,
            },
          );

          // And the action never committed without its record.
          const members = yield* memberRoles(teamId);
          assert.strictEqual(
            members.find(({ id }) => id === member.memberId)?.role,
            'member',
          );
          assert.lengthOf(yield* auditRows(teamId), 0);
        }),
      { timeout: 30_000 },
    );

    suite.effect(
      'signals and rolls back when a denial audit insert fails',
      () =>
        Effect.gen(function* () {
          const teamId = yield* seedTeam('command-denial-audit-failure');
          const owner = identity(teamId, 'owner', 'owner');
          const member = identity(teamId, 'member', 'member');
          yield* seedIdentity(teamId, owner);
          yield* seedIdentity(teamId, member);
          const requestId = randomUUID();
          yield* clearRecorded();

          const drop = yield* refusingAuditInsert('refuse_denial_append');
          const exit = yield* Effect.exit(
            asActor(
              member,
              updateTeamMemberRole(access(teamId, 'member'), {
                memberId: owner.memberId,
                role: 'member',
              }),
              { requestId },
            ),
          ).pipe(Effect.ensuring(drop));
          assert.isTrue(Exit.isFailure(exit));

          const recordedSignals = yield* Effect.flatMap(
            RecordedSignals,
            (recorder) => recorder.signals,
          );
          assert.deepStrictEqual(
            recordedSignals.map(({ code }) => code),
            ['STUDIO_AUDIT_APPEND_FAILED'],
          );
          assert.deepStrictEqual(
            {
              eventType: recordedSignals[0]?.detail.eventType,
              outcome: recordedSignals[0]?.detail.outcome,
              teamId: recordedSignals[0]?.detail.teamId,
              requestId: recordedSignals[0]?.detail.requestId,
            },
            {
              eventType: 'team.member.role_change_denied',
              outcome: 'denied',
              teamId,
              requestId,
            },
          );

          const members = yield* memberRoles(teamId);
          assert.strictEqual(
            members.find(({ id }) => id === owner.memberId)?.role,
            'owner',
          );
          assert.lengthOf(yield* auditRows(teamId), 0);
        }),
      { timeout: 30_000 },
    );

    suite.effect(
      'retains history after mutable users, memberships, and invitations cascade',
      () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const teamId = yield* seedTeam('command-retention');
          const owner = identity(teamId, 'owner', 'owner');
          yield* seedIdentity(teamId, owner);
          yield* asActor(
            owner,
            createTeamInvitation(access(teamId), {
              email: 'retained@example.com',
              role: 'member',
            }),
          );

          yield* harness.onOwner(
            harness.owner.sql`delete from "user" where id = ${owner.userId}`,
          );

          const members = yield* memberRoles(teamId);
          assert.lengthOf(members, 0);
          const invitations = yield* harness.onOwner(
            harness.owner.sql<{
              id: string;
            }>`select id from team_invitations where team_id = ${teamId}`,
          );
          assert.lengthOf(invitations, 0);
          // The log outlives every mutable row it names, which is what makes
          // it a record rather than a view.
          assert.lengthOf(yield* auditRows(teamId), 1);
        }),
      { timeout: 30_000 },
    );
  });
});

/** Asserts a command failed with `FORBIDDEN` and nothing else. */
const expectForbidden = <A, E, R>(command: Effect.Effect<A, E, R>) =>
  expectCode(command, 'FORBIDDEN');

const expectCode = Effect.fnUntraced(function* <A, E, R>(
  command: Effect.Effect<A, E, R>,
  code: TeamCommandError['code'],
) {
  const exit = yield* Effect.exit(command);
  assert.isTrue(Exit.isFailure(exit));
  const error: unknown = Exit.isFailure(exit)
    ? Cause.squash(exit.cause)
    : undefined;
  assert.isTrue(error instanceof TeamCommandError);
  assert.strictEqual(
    error instanceof TeamCommandError ? error.code : undefined,
    code,
  );
});

/**
 * Waits until some backend is blocked on an advisory lock — the signal a
 * command that is queued behind the team's audit lock actually produces.
 *
 * Polled on a bounded schedule rather than slept through: a fixed wait would
 * either be long enough to be slow or short enough to be flaky, and neither
 * would be evidence that the command reached the lock at all.
 */
const waitUntilBlocked = Effect.fnUntraced(function* (
  harness: TestDatabase['Service'],
) {
  yield* Effect.repeat(
    Effect.flatMap(
      harness.onOwner(
        harness.owner.sql<{ waiting: number }>`
          select count(*)::int as waiting
            from pg_locks
           where locktype = 'advisory' and not granted`,
      ),
      (rows) =>
        (rows[0]?.waiting ?? 0) > 0
          ? Effect.void
          : Effect.fail('not blocked yet' as const),
    ),
    // Bounded by round trips rather than by an interval: every iteration is a
    // real query, so the loop paces itself — and `it.effect` installs a
    // `TestClock`, under which a spaced schedule would never advance.
    Schedule.recurs(200),
  ).pipe(Effect.orDie);
});
