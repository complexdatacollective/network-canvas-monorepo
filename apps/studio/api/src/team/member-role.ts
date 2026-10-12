import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/sql';

import { AUTH_TABLES } from '../db/auth-schema.ts';
import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';

const { team_members: teamMembers } = AUTH_TABLES;

/** Held `FOR SHARE`, so a role change waits for the reading transaction. */
export const sharedMemberRole: (
  teamId: string,
  userId: string,
) => Effect.Effect<string | null, SqlError.SqlError, Transaction> = Effect.fn(
  'team.sharedMemberRole',
)(function* (teamId: string, userId: string) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(
      and(eq(teamMembers.team_id, teamId), eq(teamMembers.user_id, userId)),
    )
    .for('share', { of: teamMembers });
  return rows[0]?.role ?? null;
}, sqlErrorsOnly);
