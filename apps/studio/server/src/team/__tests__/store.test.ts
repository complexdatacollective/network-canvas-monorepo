import { randomUUID } from 'node:crypto';

import { assert, layer } from '@effect/vitest';
import { Cause, Effect, Exit } from 'effect';
import { describe } from 'vitest';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import { TenantScope, unsafeMakeTeamAccess } from '../../db/tenant.ts';
import { enqueueInvitationDelivery } from '../invitation-delivery-store.ts';
import * as store from '../store.ts';

// What each write in `team/store.ts` does when it changes NO row.
//
// Every one of those writes ends in `.returning()`, and the reason is not
// decoration: without it the drizzle builder answers with the driver's own
// result object, which is *typed* as a row array and is not one. Every check
// below would then read a length that is `undefined` — and `!== 1` and
// `=== 0` do not fail the same way, so one site would start dying on writes
// that worked and another would start reporting a conflict as a success.
//
// So each case here drives the zero-row state deliberately, and asserts which
// of the two the site chooses. Two writes have no zero-row state to drive at
// all — a plain INSERT with no `ON CONFLICT` either writes its row or raises —
// and they are covered by their positive half instead, which is what catches a
// missing `.returning()` there.

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
              // A member id this team does not carry: the caller locked a row
              // a statement ago, so a write that matches none means the row
              // went away under it, and there is no state to recover to.
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
        // Already accepted: the predicate names `status = 'pending'`, so the
        // second acceptance matches nothing.
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
          // `createInvitation` and `createMember` have no zero-row state to
          // drive: neither carries `ON CONFLICT`, so each either writes its row
          // or raises. What a missing `.returning()` would do to them is make
          // the row they read back `undefined` — so reading a real row back IS
          // the assertion.
          const invitation = yield* TenantScope.open(
            access,
            store.createInvitation({
              id: randomUUID(),
              teamId,
              email: `plain-${randomUUID().slice(0, 8)}@example.com`,
              role: 'member',
              inviterId: userId,
            }),
          );
          assert.strictEqual(invitation.status, 'pending');
          assert.strictEqual(invitation.role, 'member');
          // The lifetime is the database's, so it is a real instant rather than
          // whatever a caller passed — 48 hours ahead, give or take the run.
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
              email,
              role: 'member',
              inviterId: userId,
            }),
          );
          const payload = {
            invitationId,
            teamId,
            email,
            role: 'member' as const,
            teamLabel: 'Delivery Team',
            inviterLabel: 'Delivery Inviter',
            expiresAt: invitation.expiresAt,
          };

          const first = yield* TenantScope.open(
            access,
            enqueueInvitationDelivery(payload),
          );
          // `ON CONFLICT (invitation_id) DO NOTHING` returns no row the second
          // time. The re-read is what turns that into the SAME delivery rather
          // than a second one — which is what a command retry needs.
          const replay = yield* TenantScope.open(
            access,
            enqueueInvitationDelivery(payload),
          );
          assert.deepStrictEqual(replay, first);

          // And a payload that does not match the durable row is not a retry at
          // all: the conflict returns no row and the re-read finds none either,
          // so the command that asked dies rather than queueing a send under
          // somebody else's labels.
          const mismatched = yield* Effect.exit(
            TenantScope.open(
              access,
              enqueueInvitationDelivery({
                ...payload,
                inviterLabel: 'Somebody Else',
              }),
            ),
          );
          assert.include(
            REASON(mismatched),
            'invitation delivery enqueue did not match a live pending invitation',
          );
        }),
    );
  });
});
