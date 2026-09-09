// The protocol-builder contract's inputs name a protocol and nothing else —
// no team, no draft — because a host is whatever serves that one protocol.
// Studio's storage is team-scoped and edits go through a draft, so both are
// derived here from the caller's own memberships, exactly as `requireStudy`
// derives a study's tenant rather than trusting one from the browser
// (app-shell design §6.3).
import type pg from 'pg';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import type { Principal } from '../auth/service.ts';
import { ProtocolStore } from '../protocol/store.ts';
import { seesEveryTeamStudy, type ActorMembership } from '../study/tenancy.ts';
import type { ProtocolBuilderSession } from './host.ts';

export type ResolveProtocolInput = {
  protocolId: string;
  principal: Principal;
  requestId: string;
  connectionId: string;
  clientSessionId: string;
  memberships: readonly ActorMembership[];
};

/**
 * The session for one protocol, or null when the caller cannot reach it.
 *
 * "No such protocol", "a protocol in a team you are not in" and "a protocol
 * behind a study you hold no grant on" are one answer, so this is no more an
 * existence oracle than `studies.get` is. Each probe runs inside its team's
 * own transaction under row-level security and #1257's visibility rule.
 */
export async function resolveProtocolSession(
  pool: pg.Pool,
  input: ResolveProtocolInput,
): Promise<ProtocolBuilderSession | null> {
  for (const membership of input.memberships) {
    const tenantDb = createTenantDb(pool, membership.teamId);
    const store = new ProtocolStore(tenantDb);
    const reachable = await store.isReachableByCaller(input.protocolId, {
      actorUserId: input.principal.userId,
      seesEveryStudy: seesEveryTeamStudy(membership.role),
    });
    if (!reachable) continue;
    const draftId = await store.latestDraftId(input.protocolId);
    // A line whose drafts have all been published or discarded is reachable
    // but not editable, which is the same refusal as an unreachable one: the
    // contract has no "this protocol has nothing open" to report.
    if (draftId === undefined) return null;
    return {
      protocolId: input.protocolId,
      draftId,
      tenantDb,
      principal: input.principal,
      requestId: input.requestId,
      connectionId: input.connectionId,
      clientSessionId: input.clientSessionId,
    };
  }
  return null;
}
