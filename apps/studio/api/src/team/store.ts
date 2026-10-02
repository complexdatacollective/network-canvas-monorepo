import { and, eq, or, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/sql';

import type { TeamRole } from '@codaco/studio-contract/schema/team';

import { AUTH_TABLES } from '../db/auth-schema.ts';
import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';

// `sqlErrorsOnly` on every span: the drizzle error message interpolates every
// bind parameter, here email addresses and member ids.
//
// The invitation lifetime is the database's clock throughout, never a
// JavaScript `Date`.

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

const memberColumns = {
  id: teamMembers.id,
  userId: teamMembers.user_id,
  role: teamMembers.role,
  name: user.name,
  email: user.email,
} as const;

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
 * One statement ordered by id: two commands locking the same pair in opposite
 * orders would deadlock.
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
 * Better Auth stores roles as one comma-separated string: `role = 'owner'`
 * would miss a legacy `owner,admin` row.
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
  // `::int`: `count(*)` is `int8`, which the driver decodes as a `bigint`.
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
 * `nowait`: the delivery handler holds this row for its SMTP call, and a cancel
 * that waited would hold the team's audit lock behind a send.
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
