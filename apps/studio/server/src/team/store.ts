import { and, eq, or, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import type { TeamRole } from '@codaco/studio-rpc';

import { AUTH_TABLES } from '../db/auth-schema.ts';
import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';

// The team tier's reads and writes, as spans on the caller's own transaction
// (#1927 §10). Every one of them requires `Transaction`, which only the scopes
// in `db/tenant.ts` provide, so a statement here cannot reach a connection the
// command that called it is not committing on — the guarantee the
// `pg.PoolClient` parameter it replaces asked every caller to remember.
//
// Two conventions the whole module keeps:
//
//   * `sqlErrorsOnly` on every span. The drizzle builder re-raises a failed
//     statement as an `EffectDrizzleQueryError` whose message interpolates the
//     query text and every bind parameter — here, invitation email addresses
//     and member identifiers — into anything that logs it.
//   * `.returning()` on every write whose outcome is inspected. Without it the
//     builder answers with the driver's own result object, which is *typed* as
//     a row array and is not one, so `rows.length !== 1` would never be true
//     and every "this locked row disappeared" check would silently invert.
//
// The invitation lifetime is the database's clock throughout —
// `clock_timestamp()`, never a JavaScript `Date`. An application host running
// behind must not be able to accept an invitation Postgres considers expired,
// and the only way to keep that true is to never let the comparison leave SQL.

const {
  team_members: teamMembers,
  team_invitations: teamInvitations,
  user,
} = AUTH_TABLES;

export type LockedMember = {
  id: string;
  userId: string;
  role: string;
  name: string;
  email: string;
};

export type TeamInvitation = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
};

export type LockedTeamInvitation = TeamInvitation & {
  isLive: boolean;
};

export type LockedMembershipSet = {
  count: number;
  existing: LockedMember | null;
};

/** The columns a locked membership row is read as, everywhere below. */
const memberColumns = {
  id: teamMembers.id,
  userId: teamMembers.user_id,
  role: teamMembers.role,
  name: user.name,
  email: user.email,
} as const;

/**
 * The team an invitation belongs to, or null for an id no invitation carries.
 *
 * The one read on this path that cannot be tenant-stamped: the caller is not a
 * member of anything yet and the browser supplies only the opaque id, so the
 * team is what this resolves. `team_invitations` is better-auth's table and
 * carries no row-level-security policy, which is why an untenanted transaction
 * can see it at all — every table that does carry one fails closed without the
 * GUC (`studio-sync/src/rls.ts`).
 */
export const findInvitationTeam: (
  invitationId: string,
) => Effect.Effect<string | null, SqlError.SqlError, Transaction> = Effect.fn(
  'team.store.findInvitationTeam',
)(function* (invitationId: string) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({ teamId: teamInvitations.team_id })
    .from(teamInvitations)
    .where(eq(teamInvitations.id, invitationId));
  return rows[0]?.teamId ?? null;
}, sqlErrorsOnly);

/**
 * The actor's and the target's membership rows, locked together in one
 * statement ordered by id.
 *
 * One statement rather than two, because two would take the rows in whichever
 * order each concurrent command happened to ask for them, and two commands
 * asking for the same pair in opposite orders deadlock. `ORDER BY` fixes a
 * global order; `FOR UPDATE OF` names only the membership rows, so the join to
 * `"user"` does not lock a user row that has nothing to do with this team.
 */
export const lockActorAndTarget: (input: {
  teamId: string;
  actorUserId: string;
  targetMemberId: string;
}) => Effect.Effect<
  { actor: LockedMember | null; target: LockedMember | null },
  SqlError.SqlError,
  Transaction
> = Effect.fn('team.store.lockActorAndTarget')(function* (input: {
  teamId: string;
  actorUserId: string;
  targetMemberId: string;
}) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select(memberColumns)
    .from(teamMembers)
    .innerJoin(user, eq(user.id, teamMembers.user_id))
    .where(
      and(
        eq(teamMembers.team_id, input.teamId),
        or(
          eq(teamMembers.user_id, input.actorUserId),
          eq(teamMembers.id, input.targetMemberId),
        ),
      ),
    )
    .orderBy(teamMembers.id)
    .for('update', { of: teamMembers });
  return {
    actor: rows.find((member) => member.userId === input.actorUserId) ?? null,
    target: rows.find((member) => member.id === input.targetMemberId) ?? null,
  };
}, sqlErrorsOnly);

/** The actor's own membership row, locked. Null when they are not a member. */
export const lockActor: (
  teamId: string,
  actorUserId: string,
) => Effect.Effect<LockedMember | null, SqlError.SqlError, Transaction> =
  Effect.fn('team.store.lockActor')(function* (
    teamId: string,
    actorUserId: string,
  ) {
    const { tx } = yield* Transaction;
    const rows = yield* tx
      .select(memberColumns)
      .from(teamMembers)
      .innerJoin(user, eq(user.id, teamMembers.user_id))
      .where(
        and(
          eq(teamMembers.team_id, teamId),
          eq(teamMembers.user_id, actorUserId),
        ),
      )
      .for('update', { of: teamMembers });
    return rows[0] ?? null;
  }, sqlErrorsOnly);

/**
 * How many owners the team has, with every one of their rows locked.
 *
 * The lock is the point: the count decides whether a demotion would leave the
 * team ownerless, and two owners demoting themselves at once must not both
 * read two. Locking every owner row serialises them, so the second reads one.
 *
 * Better Auth stores roles as one comma-separated string, which is why the
 * predicate splits rather than compares: `role = 'owner'` would miss a legacy
 * `owner,admin` row and let the team be left with no owner at all.
 *
 * The lock is belt to `audited`'s braces, and no suite can tell them apart.
 * Every audited command takes the team's advisory lock before its body runs
 * (`audit/audited.ts`), which already serialises two demotions of the same
 * team — measured: removing `.for('update')` here leaves
 * `team/__tests__/commands.test.ts` green, while removing `lockTeam` fails two
 * of its cases. It stays because a caller that reaches this store outside an
 * audited command would otherwise have nothing, and because the row lock is
 * what the count actually means.
 */
export const countLockedOwners: (
  teamId: string,
) => Effect.Effect<number, SqlError.SqlError, Transaction> = Effect.fn(
  'team.store.countLockedOwners',
)(function* (teamId: string) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.team_id, teamId),
        sql`regexp_split_to_array(replace(${teamMembers.role}, ' ', ''), ',')
            @> ARRAY['owner']::text[]`,
      ),
    )
    .orderBy(teamMembers.id)
    .for('update');
  return rows.length;
}, sqlErrorsOnly);

export const updateMemberRole: (input: {
  teamId: string;
  memberId: string;
  role: TeamRole;
}) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'team.store.updateMemberRole',
)(function* (input: { teamId: string; memberId: string; role: TeamRole }) {
  const { tx } = yield* Transaction;
  const updated = yield* tx
    .update(teamMembers)
    .set({ role: input.role })
    .where(
      and(
        eq(teamMembers.team_id, input.teamId),
        eq(teamMembers.id, input.memberId),
      ),
    )
    .returning({ id: teamMembers.id });
  if (updated.length !== 1) {
    // The caller locked this row a statement ago, so nothing may have removed
    // it. A defect rather than a failure: there is no state a caller could
    // recover to, and the command must not commit a role change that the
    // database did not make.
    return yield* Effect.die(
      new Error('locked team member disappeared before update'),
    );
  }
}, sqlErrorsOnly);

export const hasMemberWithEmail: (
  teamId: string,
  email: string,
) => Effect.Effect<boolean, SqlError.SqlError, Transaction> = Effect.fn(
  'team.store.hasMemberWithEmail',
)(function* (teamId: string, email: string) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({ present: sql<number>`1` })
    .from(teamMembers)
    .innerJoin(user, eq(user.id, teamMembers.user_id))
    .where(
      and(
        eq(teamMembers.team_id, teamId),
        sql`lower(${user.email}) = ${email}`,
      ),
    )
    .limit(1);
  return rows.length === 1;
}, sqlErrorsOnly);

export const hasLivePendingInvitation: (
  teamId: string,
  email: string,
) => Effect.Effect<boolean, SqlError.SqlError, Transaction> = Effect.fn(
  'team.store.hasLivePendingInvitation',
)(function* (teamId: string, email: string) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({ present: sql<number>`1` })
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.team_id, teamId),
        sql`lower(${teamInvitations.email}) = ${email}`,
        eq(teamInvitations.status, 'pending'),
        sql`${teamInvitations.expires_at} > clock_timestamp()`,
      ),
    )
    .limit(1);
  return rows.length === 1;
}, sqlErrorsOnly);

export const countLivePendingInvitations: (
  teamId: string,
) => Effect.Effect<number, SqlError.SqlError, Transaction> = Effect.fn(
  'team.store.countLivePendingInvitations',
)(function* (teamId: string) {
  const { tx } = yield* Transaction;
  // `::int` is not decoration: `count(*)` is `int8`, which the driver decodes
  // as a `bigint`, and every comparison against the invitation ceiling would
  // then be a number against a bigint.
  const rows = yield* tx
    .select({ count: sql<number>`count(*)::int` })
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.team_id, teamId),
        eq(teamInvitations.status, 'pending'),
        sql`${teamInvitations.expires_at} > clock_timestamp()`,
      ),
    );
  return rows[0]?.count ?? 0;
}, sqlErrorsOnly);

export const createInvitation: (input: {
  id: string;
  teamId: string;
  email: string;
  role: TeamRole;
  inviterId: string;
}) => Effect.Effect<TeamInvitation, SqlError.SqlError, Transaction> = Effect.fn(
  'team.store.createInvitation',
)(function* (input: {
  id: string;
  teamId: string;
  email: string;
  role: TeamRole;
  inviterId: string;
}) {
  const { tx } = yield* Transaction;
  const inserted = yield* tx
    .insert(teamInvitations)
    .values({
      id: input.id,
      team_id: input.teamId,
      email: input.email,
      role: input.role,
      status: 'pending',
      // The database's clock, and the database's arithmetic: the outbox row
      // the delivery enqueue checks itself against carries this instant, and a
      // lifetime computed on a host whose clock drifts would disagree with
      // every later `expires_at > clock_timestamp()`.
      expires_at: sql`clock_timestamp() + INTERVAL '48 hours'`,
      inviter_id: input.inviterId,
    })
    .returning({
      id: teamInvitations.id,
      email: teamInvitations.email,
      role: teamInvitations.role,
      status: teamInvitations.status,
      expiresAt: teamInvitations.expires_at,
    });
  const row = inserted[0];
  if (row === undefined) {
    return yield* Effect.die(new Error('invitation insert returned no row'));
  }
  return row;
}, sqlErrorsOnly);

/**
 * The label an audit event names an invitation by, read without taking its
 * lock — a refusal that could not get the lock still has to say which
 * invitation it refused. Null when the team has no such invitation.
 */
export const readInvitationLabel: (
  teamId: string,
  invitationId: string,
) => Effect.Effect<string | null, SqlError.SqlError, Transaction> = Effect.fn(
  'team.store.readInvitationLabel',
)(function* (teamId: string, invitationId: string) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({ email: teamInvitations.email })
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.team_id, teamId),
        eq(teamInvitations.id, invitationId),
      ),
    );
  return rows[0]?.email ?? null;
}, sqlErrorsOnly);

/**
 * `nowait` is what cancellation asks for: the delivery handler holds this same
 * row for the length of its SMTP call (#1895), and a cancel that waited would
 * hold the team's audit lock behind a send. Postgres answers 55P03 instead,
 * which the command turns into its delivery-in-progress refusal. Acceptance
 * keeps the blocking lock: it has no send to wait behind.
 *
 * `isLive` is computed in SQL for the reason the whole module keeps the clock
 * in the database: an application host running behind must not be able to
 * accept an invitation Postgres considers expired.
 */
export const lockInvitation: (
  teamId: string,
  invitationId: string,
  options?: { nowait?: boolean },
) => Effect.Effect<
  LockedTeamInvitation | null,
  SqlError.SqlError,
  Transaction
> = Effect.fn('team.store.lockInvitation')(function* (
  teamId: string,
  invitationId: string,
  options: { nowait?: boolean } = {},
) {
  const { tx } = yield* Transaction;
  const columns = {
    id: teamInvitations.id,
    email: teamInvitations.email,
    role: teamInvitations.role,
    status: teamInvitations.status,
    expiresAt: teamInvitations.expires_at,
    isLive: sql<boolean>`${teamInvitations.expires_at} > clock_timestamp()`,
  } as const;
  const selection = tx
    .select(columns)
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.team_id, teamId),
        eq(teamInvitations.id, invitationId),
      ),
    );
  const rows = yield* options.nowait
    ? selection.for('update', { noWait: true })
    : selection.for('update');
  return rows[0] ?? null;
}, sqlErrorsOnly);

/**
 * Every membership row in the team, locked, plus the caller's own if they have
 * one.
 *
 * The whole set rather than one row because acceptance decides against the
 * team's membership ceiling as well as against the caller's own membership,
 * and a count taken outside the lock is one another acceptance can invalidate
 * before this one commits.
 */
export const lockMembershipSet: (
  teamId: string,
  userId: string,
) => Effect.Effect<LockedMembershipSet, SqlError.SqlError, Transaction> =
  Effect.fn('team.store.lockMembershipSet')(function* (
    teamId: string,
    userId: string,
  ) {
    const { tx } = yield* Transaction;
    const rows = yield* tx
      .select(memberColumns)
      .from(teamMembers)
      .innerJoin(user, eq(user.id, teamMembers.user_id))
      .where(eq(teamMembers.team_id, teamId))
      .orderBy(teamMembers.id)
      .for('update', { of: teamMembers });
    return {
      count: rows.length,
      existing: rows.find((member) => member.userId === userId) ?? null,
    };
  }, sqlErrorsOnly);

export const createMember: (input: {
  id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
}) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'team.store.createMember',
)(function* (input: {
  id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
}) {
  const { tx } = yield* Transaction;
  const inserted = yield* tx
    .insert(teamMembers)
    .values({
      id: input.id,
      team_id: input.teamId,
      user_id: input.userId,
      role: input.role,
    })
    .returning({ id: teamMembers.id });
  if (inserted.length !== 1) {
    return yield* Effect.die(new Error('team member insert wrote no row'));
  }
}, sqlErrorsOnly);

export const acceptInvitation: (
  teamId: string,
  invitationId: string,
) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'team.store.acceptInvitation',
)(function* (teamId: string, invitationId: string) {
  const { tx } = yield* Transaction;
  const updated = yield* tx
    .update(teamInvitations)
    .set({ status: 'accepted' })
    .where(
      and(
        eq(teamInvitations.team_id, teamId),
        eq(teamInvitations.id, invitationId),
        eq(teamInvitations.status, 'pending'),
      ),
    )
    .returning({ id: teamInvitations.id });
  if (updated.length !== 1) {
    return yield* Effect.die(
      new Error('locked invitation disappeared before acceptance'),
    );
  }
}, sqlErrorsOnly);

export const cancelInvitation: (
  teamId: string,
  invitationId: string,
) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'team.store.cancelInvitation',
)(function* (teamId: string, invitationId: string) {
  const { tx } = yield* Transaction;
  const updated = yield* tx
    .update(teamInvitations)
    .set({ status: 'canceled' })
    .where(
      and(
        eq(teamInvitations.team_id, teamId),
        eq(teamInvitations.id, invitationId),
        eq(teamInvitations.status, 'pending'),
      ),
    )
    .returning({ id: teamInvitations.id });
  if (updated.length !== 1) {
    return yield* Effect.die(
      new Error('locked invitation disappeared before cancellation'),
    );
  }
}, sqlErrorsOnly);
