import { Effect, Schema } from 'effect';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { ProtocolsRpcs } from '@codaco/studio-contract/rpc/protocols';
import { NotFound } from '@codaco/studio-contract/schema/errors';
import {
  CreateProtocolResult,
  ManifestRevision,
  ProtocolAuthorizationError,
  ProtocolDraft,
  ProtocolSummary,
} from '@codaco/studio-contract/schema/protocol';

import { AuditCommandTeamNotFoundError } from '../../audit/command.ts';
import {
  addAuditedInformationStage,
  createAuditedProtocol,
  moveAuditedProtocolStage,
  ProtocolCommandAuthorizationError,
} from '../../protocol/commands.ts';
import { ProtocolStore } from '../../protocol/store.ts';
import { seesEveryTeamStudy } from '../../study/tenancy.ts';
import { requireCipher, runCommand } from '../bridge.ts';
import type { RpcDeps } from '../deps.ts';
import {
  openProtocol,
  openTeam,
  openTeamForAdministration,
} from '../team-scope.ts';

// Every procedure here except `create` and `list` is addressed by a protocol
// line, and #1257's rule decides which lines a caller has: `openProtocol`
// refuses the rest, exactly as `studies.get` refuses the study in front of
// them. Creating a line answers to the same rule from the other side — a line
// no study owns is reachable only by an Admin or Owner, so only they may make
// one.

/**
 * A locked membership that lost the role it needed is
 * `ProtocolAuthorizationError` — the protocol tier's own refusal, carrying no
 * reason beyond `detail` for the same reason `Forbidden` carries none. A team
 * row that went away under the command is the shared `NotFound`.
 */
const protocolRefusal = (
  cause: unknown,
): Effect.Effect<never, NotFound | ProtocolAuthorizationError> => {
  if (cause instanceof ProtocolCommandAuthorizationError) {
    return new ProtocolAuthorizationError({});
  }
  if (cause instanceof AuditCommandTeamNotFoundError) return new NotFound({});
  return Effect.die(cause);
};

const decodeCreated = Schema.decodeUnknownSync(CreateProtocolResult);
const decodeSummaries = Schema.decodeUnknownSync(Schema.Array(ProtocolSummary));
const decodeDraft = Schema.decodeUnknownSync(ProtocolDraft);
const decodeRevision = Schema.decodeUnknownSync(ManifestRevision);

export const ProtocolsHandlers = (deps: RpcDeps) =>
  ProtocolsRpcs.toLayer({
    'protocols.create': (payload) =>
      Effect.gen(function* () {
        const scope = yield* openTeamForAdministration(
          deps,
          yield* Principal,
          payload.teamId,
        );
        const cipher = yield* requireCipher(deps);
        return decodeCreated(
          yield* runCommand(
            () =>
              createAuditedProtocol(
                {
                  tenantDb: scope.tenantDb,
                  principal: scope.principal,
                  requestId: scope.requestId,
                },
                payload,
                cipher,
              ),
            protocolRefusal,
          ),
        );
      }),
    // The list names no protocol, so it takes the same predicate as a query
    // rather than as a refusal: a Member is shown the lines behind the studies
    // they hold a grant on, and an Admin or Owner every line.
    'protocols.list': (payload) =>
      Effect.gen(function* () {
        const scope = yield* openTeam(deps, yield* Principal, payload.teamId);
        const cipher = yield* requireCipher(deps);
        return decodeSummaries(
          yield* Effect.promise(() =>
            new ProtocolStore(scope.tenantDb, cipher).listProtocols({
              actorUserId: scope.principal.userId,
              seesEveryStudy: seesEveryTeamStudy(scope.team.role),
            }),
          ),
        );
      }),
    'protocols.draft': (payload) =>
      Effect.gen(function* () {
        const scope = yield* openProtocol(deps, yield* Principal, payload);
        const cipher = yield* requireCipher(deps);
        const { protocol, draft } = yield* Effect.promise(() =>
          new ProtocolStore(scope.tenantDb, cipher).getProtocolDraft(
            payload.protocolId,
            payload.draftId,
          ),
        );
        return decodeDraft({
          protocol,
          revision: {
            sequence: String(draft.headSeq),
            hash: draft.headManifestHash,
          },
          sections: draft.sections,
        });
      }),
    'protocols.addInformationStage': (payload) =>
      Effect.gen(function* () {
        const scope = yield* openProtocol(deps, yield* Principal, payload);
        return decodeRevision(
          yield* runCommand(
            () =>
              addAuditedInformationStage(
                {
                  tenantDb: scope.tenantDb,
                  principal: scope.principal,
                  requestId: scope.requestId,
                },
                payload,
              ),
            protocolRefusal,
          ),
        );
      }),
    'protocols.moveStage': (payload) =>
      Effect.gen(function* () {
        const scope = yield* openProtocol(deps, yield* Principal, payload);
        return decodeRevision(
          yield* runCommand(
            () =>
              moveAuditedProtocolStage(
                {
                  tenantDb: scope.tenantDb,
                  principal: scope.principal,
                  requestId: scope.requestId,
                },
                payload,
              ),
            protocolRefusal,
          ),
        );
      }),
  });
