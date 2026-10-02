import { Effect } from 'effect';
import type { SqlError } from 'effect/sql';

import type { Transaction } from '../db/tenant.ts';
import { tryParseRoles } from '../team/roles.ts';
import { lockActor } from '../team/store.ts';
import { rolesGrantAuditPermission } from './permissions.ts';

// Authorization must share the read's transaction: membership resolved
// before it opens is stale by the time rows are selected.

export type AuditReadAuthorization = 'permitted' | 'not_a_member' | 'denied';

export function grantsAuditRead(role: string): boolean {
  return rolesGrantAuditPermission(tryParseRoles(role) ?? [], 'audit.read');
}

export const authorizeAuditRead: (input: {
  teamId: string;
  actorUserId: string;
}) => Effect.Effect<AuditReadAuthorization, SqlError.SqlError, Transaction> =
  Effect.fn('audit.authorizeRead')(function* (input: {
    teamId: string;
    actorUserId: string;
  }) {
    const actor = yield* lockActor(input.teamId, input.actorUserId);
    if (actor === null) return 'not_a_member' as const;
    return grantsAuditRead(actor.role) ? 'permitted' : 'denied';
  });
