// The protocol-builder contract's inputs name a protocol and nothing else —
// no team, no draft — because a host is whatever serves that one protocol.
// Studio's storage is team-scoped and edits go through a draft, so both are
// derived here from the caller's own memberships, exactly as `requireStudy`
// derives a study's tenant rather than trusting one from the browser
// (app-shell design §6.3).
//
// This is also one of the named `TeamAccess` constructors (#1927 §10).
// `TenantScope.open` takes the branded token rather than a team id, so a tenant
// transaction cannot be opened without a membership check having happened —
// which only holds while the constructors are few and each one has just proved
// something. `openSession` is the editor host's: it proves the caller can reach
// the protocol, and mints the access every transaction the session goes on to
// open is opened on.
//
// What used to be here as well, and is not any more: a second authorization
// error and the editor's own `lockActorMembership` / `lockProtocolDraft`. They
// made the same checks under the same `FOR UPDATE OF protocols,
// protocol_drafts` as `protocol/commands.ts`, and existed only because that
// module could not be imported while it was still node-postgres. There is one
// definition of each now, in `protocol/commands.ts`, and `host.ts` calls it.
import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import type { SessionPrincipal } from '../auth/service.ts';
import type { Database } from '../db/client.ts';
import { TenantScope, unsafeMakeTeamAccess } from '../db/tenant.ts';
import { isReachableByCaller, latestDraftId } from '../protocol/store.ts';
import { principalOf } from '../rpc/authenticated.ts';
import type { SecretsCipherApi } from '../secrets/cipher.ts';
import { seesEveryTeamStudy, type ActorMembership } from '../study/tenancy.ts';
import type { ProtocolBuilderSession } from './host.ts';

export type OpenSessionInput = {
  protocolId: string;
  principal: SessionPrincipal;
  requestId: string;
  connectionId: string;
  clientSessionId: string;
  memberships: readonly ActorMembership[];
  /** Carried onto the session: what seals an API-key asset on write (#1900). */
  cipher: SecretsCipherApi;
};

/**
 * The session for one protocol, or null when the caller cannot reach it.
 *
 * "No such protocol", "a protocol in a team you are not in" and "a protocol
 * behind a study you hold no grant on" are one answer, so this is no more an
 * existence oracle than `studies.get` is. Each probe runs inside its team's own
 * transaction under row-level security and #1257's visibility rule — which is
 * why the access is minted per membership: the membership list IS the proof
 * that this caller may act in that team, and the probe is what then decides
 * which of those teams the protocol is in.
 */
export const openSession: (
  input: OpenSessionInput,
) => Effect.Effect<ProtocolBuilderSession | null, SqlError.SqlError, Database> =
  Effect.fn('protocolBuilder.openSession')(function* (input: OpenSessionInput) {
    // Branded once, here, so the principal a command is audited under cannot
    // differ between the two transports.
    const principal = principalOf(input.principal);
    for (const membership of input.memberships) {
      const access = unsafeMakeTeamAccess(membership.teamId, membership.role);
      const probe = yield* TenantScope.open(
        access,
        Effect.gen(function* () {
          const reachable = yield* isReachableByCaller(
            membership.teamId,
            input.protocolId,
            {
              actorUserId: principal.userId,
              seesEveryStudy: seesEveryTeamStudy(membership.role),
            },
          );
          if (!reachable) return { reachable: false } as const;
          return {
            reachable: true,
            draftId: yield* latestDraftId(membership.teamId, input.protocolId),
          } as const;
        }),
      );
      if (!probe.reachable) continue;
      // A line whose drafts have all been published or discarded is reachable but
      // not editable, which is the same refusal as an unreachable one: the
      // contract has no "this protocol has nothing open" to report.
      if (probe.draftId === undefined) return null;
      return {
        protocolId: input.protocolId,
        draftId: probe.draftId,
        access,
        cipher: input.cipher,
        principal,
        requestId: input.requestId,
        connectionId: input.connectionId,
        clientSessionId: input.clientSessionId,
      } satisfies ProtocolBuilderSession;
    }
    return null;
  });
