import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { StudiesRpcs } from '@codaco/studio-contract/rpc/studies';
import { NotFound } from '@codaco/studio-contract/schema/errors';
import {
  CreateStudyResult,
  StudyCommandError,
  StudyDetail,
  StudySummary,
} from '@codaco/studio-contract/schema/study';
import type { SectionValidationFailedError } from '@codaco/studio-sync/section-validation';

import { TenantScope } from '../../db/tenant.ts';
import type { ProtocolStoreError } from '../../protocol/store.ts';
import {
  createAuditedStudy,
  StudyCommandError as StudyCommandFailure,
} from '../../study/commands.ts';
import { readStudyCounts } from '../../study/counts.ts';
import { listStudies } from '../../study/store.ts';
import { seesEveryTeamStudy } from '../../study/tenancy.ts';
import { withRequestId } from '../bridge.ts';
import type { RpcDeps } from '../deps.ts';
import { openTeam, resolveStudy } from '../team-scope.ts';

/**
 * A study command's own vocabulary, no longer flattened into a transport code:
 * a duplicate study id is `StudyCommandError({ code: 'CONFLICT' })`, and a
 * locked membership that lost the role is `{ code: 'FORBIDDEN' }`. A team row
 * that went away under the command leaves as the shared `NotFound` the audited
 * combinator raises. A protocol-store refusal and a database failure are
 * faults, exactly as they were when the command threw them into a promise.
 */
const refusals = <A, R>(
  command: Effect.Effect<
    A,
    | StudyCommandFailure
    | ProtocolStoreError
    | SectionValidationFailedError
    | NotFound
    | SqlError.SqlError,
    R
  >,
): Effect.Effect<A, NotFound | StudyCommandError, R> =>
  command.pipe(
    Effect.catch(
      (error): Effect.Effect<never, NotFound | StudyCommandError> => {
        if (error instanceof StudyCommandFailure) {
          return Effect.fail(new StudyCommandError({ code: error.code }));
        }
        if (error instanceof NotFound) return Effect.fail(error);
        return Effect.die(error);
      },
    ),
  );

const decodeSummaries = Schema.decodeUnknownSync(Schema.Array(StudySummary));
const decodeDetail = Schema.decodeUnknownSync(StudyDetail);
const decodeCreated = Schema.decodeUnknownSync(CreateStudyResult);

export const StudiesHandlers = (deps: RpcDeps) =>
  StudiesRpcs.toLayer({
    // Which studies the caller sees is their TEAM role (#1257): an Admin or
    // Owner sees the team's studies, a Member sees the ones they hold a
    // study-role grant on. The predicate is the store's, not this handler's,
    // so `studies.get` refuses exactly what `studies.list` omits.
    'studies.list': (payload) =>
      Effect.gen(function* () {
        const principal = yield* Principal;
        const access = yield* openTeam(deps, principal, payload.teamId);
        return decodeSummaries(
          yield* Effect.orDie(
            TenantScope.open(
              access,
              listStudies({
                actorUserId: principal.userId,
                seesEveryStudy: seesEveryTeamStudy(access.role),
              }),
            ),
          ),
        );
      }),
    'studies.get': (payload) =>
      Effect.gen(function* () {
        const resolved = yield* resolveStudy(yield* Principal, payload.studyId);
        const { protocolDraftId, ...study } = resolved.study;
        return decodeDetail({
          teamId: resolved.access.teamId,
          study,
          protocolDraftId,
        });
      }),
    // Resolved like `get`, so the numbers beside the sidebar's destinations
    // exist for exactly the studies their reader can open, and a study the
    // caller cannot reach is refused the same way for both.
    'studies.counts': (payload) =>
      Effect.gen(function* () {
        const resolved = yield* resolveStudy(yield* Principal, payload.studyId);
        const counts = yield* Effect.orDie(
          TenantScope.open(resolved.access, readStudyCounts(resolved.study.id)),
        );
        // `resolveStudy` found the row inside this tenant a moment ago; a row
        // missing now is a purge racing the read, not an oracle.
        if (!counts) return yield* new NotFound({});
        return counts;
      }),
    'studies.create': (payload) =>
      Effect.gen(function* () {
        const access = yield* openTeam(deps, yield* Principal, payload.teamId);
        return decodeCreated(
          yield* refusals(withRequestId(createAuditedStudy(access, payload))),
        );
      }),
  });
