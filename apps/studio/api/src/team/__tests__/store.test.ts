import { randomUUID } from 'node:crypto';

import { assert, layer } from '@effect/vitest';
import { Cause, Effect, Exit, Redacted } from 'effect';
import { describe } from 'vitest';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import { TenantScope, unsafeMakeTeamAccess } from '../../db/tenant.ts';
import { enqueueInvitationDelivery } from '../invitation-delivery-store.ts';
import * as store from '../store.ts';

const REASON = (exit: Exit.Exit<unknown, unknown>): string =>
  Exit.isFailure(exit) ? Cause.pretty(exit.cause) : 'it succeeded';

describe.skipIf(!testDb)('the team store’s writes', () => {
  layer(TestDatabaseLive)('over a provisioned schema', (suite) => {
    const seed = Effect.fnUntraced(function* (label: string) {
      const harness = yield* TestDatabase;
      const teamId = `${label}-${randomUUID().slice(0, 8)}`;
      const userId = `${teamId}-user`;
      const memberId = `${teamId}-member`;
      yield* harness.onOwner(
        harness.owner.sql`insert into teams (id, name, slug)
                          values (${teamId}, ${teamId}, ${teamId})`,
      );
      yield* harness.onOwner(
        harness.owner.sql`insert into "user" (id, name, email, "emailVerified")
                          values (${userId}, 'Store Person',
                                  ${`${userId}@example.com`}, true)`,
      );
      yield* harness.onOwner(
        harness.owner.sql`insert into team_members (id, team_id, user_id, role)
                          values (${memberId}, ${teamId}, ${userId}, 'owner')`,
      );
      return {
        teamId,
        userId,
        memberId,
        access: unsafeMakeTeamAccess(teamId, 'owner'),
      };
    });

    const seedInvitation = Effect.fnUntraced(function* (input: {
      teamId: string;
      inviterId: string;
      status?: string;
    }) {
      const harness = yield* TestDatabase;
      const id = randomUUID();
      yield* harness.onOwner(
        harness.owner.sql`insert into team_invitations
                            (id, team_id, email, role, status, expires_at,
                             inviter_id)
                          values (${id}, ${input.teamId},
                                  ${`${id}@example.com`}, 'member',
                                  ${input.status ?? 'pending'},
                                  clock_timestamp() + interval '48 hours',
                                  ${input.inviterId})`,
      );
      return id;
    });

    suite.effect('dies when a role update matches no member row', () =>
      Effect.gen(function* () {
        const { teamId, access } = yield* seed('store-update-zero');
        const exit = yield* Effect.exit(
          TenantScope.open(
            access,
            store.updateMemberRole({
              teamId,
              memberId: `${teamId}-absent-member`,
              role: 'admin',
            }),
          ),
        );
        assert.include(
          REASON(exit),
          'locked team member disappeared before update',
        );
      }),
    );

    suite.effect('dies when an acceptance matches no pending invitation', () =>
      Effect.gen(function* () {
        const { teamId, userId, access } = yield* seed('store-accept-zero');
        const invitationId = yield* seedInvitation({
          teamId,
          inviterId: userId,
          status: 'accepted',
        });
        const exit = yield* Effect.exit(
          TenantScope.open(
            access,
            store.acceptInvitation(teamId, invitationId),
          ),
        );
        assert.include(
          REASON(exit),
          'locked invitation disappeared before acceptance',
        );
      }),
    );

    suite.effect('dies when a cancellation matches no pending invitation', () =>
      Effect.gen(function* () {
        const { teamId, userId, access } = yield* seed('store-cancel-zero');
        const invitationId = yield* seedInvitation({
          teamId,
          inviterId: userId,
          status: 'canceled',
        });
        const exit = yield* Effect.exit(
          TenantScope.open(
            access,
            store.cancelInvitation(teamId, invitationId),
          ),
        );
        assert.include(
          REASON(exit),
          'locked invitation disappeared before cancellation',
        );
      }),
    );

    suite.effect(
      'reads its own inserted row back for the two plain writes',
      () =>
        Effect.gen(function* () {
          const { teamId, userId, access } = yield* seed(
            'store-insert-returns',
          );
          const invitation = yield* TenantScope.open(
            access,
            store.createInvitation({
              id: randomUUID(),
              teamId,
              email: Redacted.make(
                `plain-${randomUUID().slice(0, 8)}@example.com`,
              ),
              role: 'member',
              inviterId: userId,
            }),
          );
          assert.strictEqual(invitation.status, 'pending');
          assert.strictEqual(invitation.role, 'member');
          assert.isAbove(
            invitation.expiresAt.getTime(),
            Date.now() + 47 * 60 * 60 * 1000,
          );

          const memberId = randomUUID();
          const newUserId = `${teamId}-second-user`;
          const harness = yield* TestDatabase;
          yield* harness.onOwner(
            harness.owner
              .sql`insert into "user" (id, name, email, "emailVerified")
                            values (${newUserId}, 'Second Person',
                                    ${`${newUserId}@example.com`}, true)`,
          );
          const created = yield* Effect.exit(
            TenantScope.open(
              access,
              store.createMember({
                id: memberId,
                teamId,
                userId: newUserId,
                role: 'member',
              }),
            ),
          );
          assert.isTrue(Exit.isSuccess(created));
        }),
    );

    suite.effect(
      'reuses a delivery row on a replay and refuses a mismatch',
      () =>
        Effect.gen(function* () {
          const { teamId, userId, access } = yield* seed('store-delivery-zero');
          const invitationId = randomUUID();
          const email = `delivery-${randomUUID().slice(0, 8)}@example.com`;
          const invitation = yield* TenantScope.open(
            access,
            store.createInvitation({
              id: invitationId,
              teamId,
              email: Redacted.make(email),
              role: 'member',
              inviterId: userId,
            }),
          );
          const payload = {
            invitationId,
            teamId,
            email: Redacted.make(email),
            role: 'member' as const,
            teamLabel: Redacted.make('Delivery Team'),
            inviterLabel: Redacted.make('Delivery Inviter'),
            expiresAt: invitation.expiresAt,
          };

          const first = yield* TenantScope.open(
            access,
            enqueueInvitationDelivery(payload),
          );
          const replay = yield* TenantScope.open(
            access,
            enqueueInvitationDelivery(payload),
          );
          assert.deepStrictEqual(replay, first);

          const mismatched = yield* Effect.exit(
            TenantScope.open(
              access,
              enqueueInvitationDelivery({
                ...payload,
                inviterLabel: Redacted.make('Somebody Else'),
              }),
            ),
          );
          assert.include(
            REASON(mismatched),
            'invitation delivery enqueue did not match a live pending invitation',
          );
        }),
    );

    suite.effect(
      'queues nothing for an invitation the payload does not describe',
      () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const { teamId, userId, access } = yield* seed(
            'store-delivery-guard',
          );
          const invite = Effect.fnUntraced(function* () {
            const invitationId = randomUUID();
            const email = `guard-${randomUUID().slice(0, 8)}@example.com`;
            const invitation = yield* TenantScope.open(
              access,
              store.createInvitation({
                id: invitationId,
                teamId,
                email: Redacted.make(email),
                role: 'member',
                inviterId: userId,
              }),
            );
            return {
              invitationId,
              teamId,
              email: Redacted.make(email),
              role: 'member' as const,
              teamLabel: Redacted.make('Guard Team'),
              inviterLabel: Redacted.make('Guard Inviter'),
              expiresAt: invitation.expiresAt,
            };
          });
          const refused = Effect.fnUntraced(function* (
            payload: Parameters<typeof enqueueInvitationDelivery>[0],
          ) {
            const exit = yield* Effect.exit(
              TenantScope.open(access, enqueueInvitationDelivery(payload)),
            );
            assert.include(
              REASON(exit),
              'invitation delivery enqueue did not match a live pending invitation',
            );
            const queued = yield* harness.onOwner(
              harness.owner.sql<{ n: number }>`
                select count(*)::int as n from team_invitation_deliveries
                 where invitation_id = ${payload.invitationId}`,
            );
            assert.strictEqual(queued[0]?.n, 0);
          });

          yield* refused({ ...(yield* invite()), role: 'admin' });

          const recipient = yield* invite();
          yield* refused({
            ...recipient,
            email: Redacted.make(`x-${Redacted.value(recipient.email)}`),
          });

          const lifetime = yield* invite();
          yield* refused({
            ...lifetime,
            expiresAt: new Date(lifetime.expiresAt.getTime() + 60_000),
          });

          const canceled = yield* invite();
          yield* harness.onOwner(
            harness.owner.sql`update team_invitations set status = 'canceled'
                               where id = ${canceled.invitationId}`,
          );
          yield* refused(canceled);

          const lapsed = yield* invite();
          const past = new Date(Date.now() - 60_000);
          yield* harness.onOwner(
            harness.owner.sql`update team_invitations set expires_at = ${past}
                               where id = ${lapsed.invitationId}`,
          );
          yield* refused({ ...lapsed, expiresAt: past });

          const untouched = yield* invite();
          const delivery = yield* TenantScope.open(
            access,
            enqueueInvitationDelivery(untouched),
          );
          assert.strictEqual(delivery.invitationId, untouched.invitationId);
        }),
    );
  });
});
