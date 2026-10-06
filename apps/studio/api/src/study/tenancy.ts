import { Effect } from 'effect';
import type { SqlError } from 'effect/sql';

import { type Database } from '../db/client.ts';
import {
  type TeamAccess,
  TenantScope,
  type Transaction,
  unsafeMakeTeamAccess,
} from '../db/tenant.ts';
import { sharedMemberRole } from '../team/member-role.ts';
import { roleGrantsTeamAdministration } from '../team/roles.ts';
import { getStudy, type StudyDetailRow } from './store.ts';

export type ActorMembership = {
  teamId: string;
  role: string;
};

export type ResolvedStudy = {
  readonly access: TeamAccess;
  readonly study: StudyDetailRow;
};

/**
 * An unparseable role list is not an admin: the safe reading of a value this
 * build does not understand is the narrower one.
 */
export function seesEveryTeamStudy(role: string): boolean {
  return roleGrantsTeamAdministration(role);
}

/** The study as the role this transaction holds may see it. */
export const reachableStudy: (input: {
  readonly teamId: string;
  readonly studyId: string;
  readonly actorUserId: string;
}) => Effect.Effect<StudyDetailRow | null, SqlError.SqlError, Transaction> =
  Effect.fn('study.tenancy.reachableStudy')(function* (input: {
    readonly teamId: string;
    readonly studyId: string;
    readonly actorUserId: string;
  }) {
    const role = yield* sharedMemberRole(input.teamId, input.actorUserId);
    if (role === null) return null;
    return yield* getStudy(input.studyId, {
      actorUserId: input.actorUserId,
      seesEveryStudy: seesEveryTeamStudy(role),
    });
  });

export const resolveStudy: (input: {
  readonly studyId: string;
  readonly actorUserId: string;
  readonly memberships: readonly ActorMembership[];
}) => Effect.Effect<ResolvedStudy | null, SqlError.SqlError, Database> =
  Effect.fn('study.tenancy.resolveStudy')(function* (input: {
    readonly studyId: string;
    readonly actorUserId: string;
    readonly memberships: readonly ActorMembership[];
  }) {
    for (const membership of input.memberships) {
      const access = unsafeMakeTeamAccess(membership.teamId, membership.role);
      const study = yield* TenantScope.open(
        access,
        reachableStudy({
          teamId: membership.teamId,
          studyId: input.studyId,
          actorUserId: input.actorUserId,
        }),
      );
      if (study !== null) return { access, study };
    }
    return null;
  });
