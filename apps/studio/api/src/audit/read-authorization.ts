import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import type { Transaction } from '../db/tenant.ts';
import { tryParseRoles } from '../team/roles.ts';
import { lockActor } from '../team/store.ts';
import { rolesGrantAuditPermission } from './permissions.ts';

// Audit reads are the one read-only path whose authorization must share the
// read's transaction. The rpc plane resolves membership before the transaction
// opens, so its role is already stale by the time rows are selected: a
// demotion committing in that window would still be answered with audit data.
// This module holds the audited-command pattern (design §8) for that read —
// lock the actor's membership row, authorize its committed role — and
// requiring `Transaction` is what makes "in the read's own transaction" a
// type-level fact rather than a convention.

/**
 * `not_a_member` is the rpc plane's own failure mode arriving late, not a
 * member being refused audit.read; only `denied` is an audit.read_denied
 * event.
 */
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
