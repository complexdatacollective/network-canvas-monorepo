import { Effect } from 'effect';
import type { SqlError } from 'effect/sql';

import { type Database } from '../db/client.ts';
import {
  type TeamAccess,
  TenantScope,
  unsafeMakeTeamAccess,
} from '../db/tenant.ts';
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
        getStudy(input.studyId, {
          actorUserId: input.actorUserId,
          seesEveryStudy: seesEveryTeamStudy(membership.role),
        }),
      );
      if (study !== null) return { access, study };
    }
    return null;
  });
