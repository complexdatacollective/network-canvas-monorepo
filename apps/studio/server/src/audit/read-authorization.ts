import type pg from 'pg';

import { tryParseRoles } from '../team/roles.ts';
import { TeamStore } from '../team/store.ts';
import { rolesGrantAuditPermission } from './permissions.ts';

// Audit reads are the one read-only path whose authorization must share the
// read's transaction. requireTeam resolves membership before the transaction
// opens, so its role is already stale by the time rows are selected: a
// demotion committing in that window would still be answered with audit data.
// This module holds the audited-command pattern (design §8) for that read —
// lock the actor's membership row, authorize its committed role — so the RPC
// router never takes the writable team store as a dependency.

const teamStore = new TeamStore();

/**
 * `not_a_member` is requireTeam's own failure mode arriving late, not a member
 * being refused audit.read; only `denied` is an audit.read_denied event.
 */
export type AuditReadAuthorization = 'permitted' | 'not_a_member' | 'denied';

export function grantsAuditRead(role: string): boolean {
  return rolesGrantAuditPermission(tryParseRoles(role) ?? [], 'audit.read');
}

export async function authorizeAuditRead(
  client: pg.PoolClient,
  input: { teamId: string; actorUserId: string },
): Promise<AuditReadAuthorization> {
  const actor = await teamStore.lockActor(
    client,
    input.teamId,
    input.actorUserId,
  );
  if (!actor) return 'not_a_member';
  return grantsAuditRead(actor.role) ? 'permitted' : 'denied';
}
