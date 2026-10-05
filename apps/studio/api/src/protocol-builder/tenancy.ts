import { Effect } from 'effect';
import type { SqlError } from 'effect/sql';

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
  cipher: SecretsCipherApi;
};

export const resolveProtocolSession: (
  input: OpenSessionInput,
) => Effect.Effect<ProtocolBuilderSession | null, SqlError.SqlError, Database> =
  Effect.fn('protocolBuilder.resolveProtocolSession')(function* (
    input: OpenSessionInput,
  ) {
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
      // Reachable but not editable is the same refusal as unreachable.
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
