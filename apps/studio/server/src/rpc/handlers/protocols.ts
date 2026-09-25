import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { TeamAccess } from '@codaco/studio-contract/middleware/team-administration';
import { ProtocolsRpcs } from '@codaco/studio-contract/rpc/protocols';
import {
  Conflict,
  Forbidden,
  NotFound,
} from '@codaco/studio-contract/schema/errors';
import {
  CreateProtocolResult,
  ManifestRevision,
  ProtocolAuthorizationError,
  ProtocolDraft,
  ProtocolSummary,
} from '@codaco/studio-contract/schema/protocol';

import { TenantScope } from '../../db/tenant.ts';
import {
  addAuditedInformationStage,
  createAuditedProtocol,
  moveAuditedProtocolStage,
  ProtocolCommandAuthorizationError,
} from '../../protocol/commands.ts';
import { DraftRevisionConflict } from '../../protocol/draft-structure.ts';
import { getProtocolDraft, listProtocols } from '../../protocol/store.ts';
import { seesEveryTeamStudy } from '../../study/tenancy.ts';
import { withRequestId } from '../bridge.ts';
import type { RpcDeps } from '../deps.ts';
import { openTeam, requireProtocol } from '../team-scope.ts';

// Every procedure here except `create` and `list` is addressed by a protocol
// line, and #1257's rule decides which lines a caller has: the reachability
// check refuses the rest, exactly as `studies.get` refuses the study in front
// of them. Creating a line answers to the same rule from the other side — a
// line no study owns is reachable only by an Admin or Owner, so only they may
// make one, and that tier is the `TeamAdministration` middleware the contract
// declares on `protocols.create` rather than a call in the handler below.
//
// The reachability check now runs INSIDE each command's own transaction: the
// handlers used to open one of their own ahead of the command, and a grant
// revoked between those two transactions could let an edit through.

/**
 * A locked membership that lost the role it needed is
 * `ProtocolAuthorizationError` — the protocol tier's own refusal, carrying no
 * reason beyond `detail` for the same reason `Forbidden` carries none. A team
 * row that went away under the command leaves as the shared `NotFound` the
 * audited combinator raises, and `Forbidden` is the procedure's own declared
 * refusal. A store refusal and a database failure are faults.
 */
const protocolRefusal = (
  error: unknown,
): Effect.Effect<never, ProtocolAuthorizationError | Forbidden | NotFound> => {
  if (error instanceof ProtocolCommandAuthorizationError) {
    return Effect.fail(new ProtocolAuthorizationError({}));
  }
  if (error instanceof Forbidden || error instanceof NotFound) {
    return Effect.fail(error);
  }
  return Effect.die(error);
};

const refusals = <A, E, R>(
  command: Effect.Effect<
    A,
    | E
    | ProtocolCommandAuthorizationError
    | Forbidden
    | NotFound
    | SqlError.SqlError,
    R
  >,
): Effect.Effect<A, ProtocolAuthorizationError | Forbidden | NotFound, R> =>
  command.pipe(Effect.catch(protocolRefusal));

/**
 * `refusals` for an edit against a revision the client named: another editor
 * having moved the draft on is the one structural refusal a client can act on
 * (re-read and retry), so it is the declared `Conflict`, not a fault.
 */
const draftRefusals = <A, E, R>(
  command: Effect.Effect<
    A,
    | E
    | DraftRevisionConflict
    | ProtocolCommandAuthorizationError
    | Forbidden
    | NotFound
    | SqlError.SqlError,
    R
  >,
): Effect.Effect<
  A,
  ProtocolAuthorizationError | Forbidden | NotFound | Conflict,
  R
> =>
  command.pipe(
    Effect.catch(
      (
        error,
      ): Effect.Effect<
        never,
        ProtocolAuthorizationError | Forbidden | NotFound | Conflict
      > =>
        error instanceof DraftRevisionConflict
          ? Effect.fail(new Conflict({ reason: 'staleRevision' }))
          : protocolRefusal(error),
    ),
  );

const decodeCreated = Schema.decodeUnknownSync(CreateProtocolResult);
const decodeSummaries = Schema.decodeUnknownSync(Schema.Array(ProtocolSummary));
const decodeDraft = Schema.decodeUnknownSync(ProtocolDraft);
const decodeRevision = Schema.decodeUnknownSync(ManifestRevision);

export const ProtocolsHandlers = (deps: RpcDeps) =>
  ProtocolsRpcs.toLayer({
    // No authorization call of its own: `TeamAdministration` has already
    // charged both windows, proved membership and proved the tier, and the
    // `TeamAccess` read here is the token it minted doing so. The command's
    // locked re-read is still the authoritative check.
    'protocols.create': (payload) =>
      Effect.gen(function* () {
        const access = yield* TeamAccess;
        return decodeCreated(
          yield* refusals(
            withRequestId(createAuditedProtocol(access, payload)),
          ),
        );
      }),
    // The list names no protocol, so it takes the same predicate as a query
    // rather than as a refusal: a Member is shown the lines behind the studies
    // they hold a grant on, and an Admin or Owner every line.
    'protocols.list': (payload) =>
      Effect.gen(function* () {
        const principal = yield* Principal;
        const access = yield* openTeam(deps, principal, payload.teamId);
        return decodeSummaries(
          yield* Effect.orDie(
            TenantScope.open(
              access,
              listProtocols(access.teamId, {
                actorUserId: principal.userId,
                seesEveryStudy: seesEveryTeamStudy(access.role),
              }),
            ),
          ),
        );
      }),
    'protocols.draft': (payload) =>
      Effect.gen(function* () {
        const access = yield* openTeam(deps, yield* Principal, payload.teamId);
        // The reachability check and the read are ONE transaction: the check
        // answers about the same snapshot the read returns, so a grant revoked
        // between them cannot let a row out.
        const { protocol, draft } = yield* TenantScope.open(
          access,
          Effect.gen(function* () {
            yield* requireProtocol(access, payload.protocolId);
            return yield* getProtocolDraft(
              access.teamId,
              payload.protocolId,
              payload.draftId,
            );
          }),
        ).pipe(
          // `Forbidden` is declared; a store refusal and a database failure are
          // faults, exactly as they were when the store threw into
          // `Effect.promise`.
          Effect.catchTag(['ProtocolStoreError', 'SqlError'], Effect.die),
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
        const access = yield* openTeam(deps, yield* Principal, payload.teamId);
        return decodeRevision(
          yield* draftRefusals(
            withRequestId(addAuditedInformationStage(access, payload)),
          ),
        );
      }),
    'protocols.moveStage': (payload) =>
      Effect.gen(function* () {
        const access = yield* openTeam(deps, yield* Principal, payload.teamId);
        return decodeRevision(
          yield* draftRefusals(
            withRequestId(moveAuditedProtocolStage(access, payload)),
          ),
        );
      }),
  });
