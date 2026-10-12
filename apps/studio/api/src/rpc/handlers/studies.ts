import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { StudiesRpcs } from '@codaco/studio-contract/rpc/studies';
import { Forbidden, NotFound } from '@codaco/studio-contract/schema/errors';
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
import { reachableStudy, seesEveryTeamStudy } from '../../study/tenancy.ts';
import { withRequestId } from '../bridge.ts';
import type { RpcDeps } from '../deps.ts';
import { openTeam, requireLockedRole, resolveStudy } from '../team-scope.ts';

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
    'studies.list': (payload) =>
      Effect.gen(function* () {
        const principal = yield* Principal;
        const access = yield* openTeam(deps, principal, payload.teamId);
        return decodeSummaries(
          yield* TenantScope.open(
            access,
            Effect.gen(function* () {
              const role = yield* requireLockedRole(access);
              return yield* listStudies({
                actorUserId: principal.userId,
                seesEveryStudy: seesEveryTeamStudy(role),
              });
            }),
          ).pipe(Effect.catchTag('SqlError', Effect.die)),
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
    'studies.counts': (payload) =>
      Effect.gen(function* () {
        const principal = yield* Principal;
        const resolved = yield* resolveStudy(principal, payload.studyId);
        const counts = yield* TenantScope.open(
          resolved.access,
          Effect.gen(function* () {
            const reached = yield* reachableStudy({
              teamId: resolved.access.teamId,
              studyId: resolved.study.id,
              actorUserId: principal.userId,
            });
            if (reached === null) return yield* new Forbidden({});
            return yield* readStudyCounts(resolved.study.id);
          }),
        ).pipe(Effect.catchTag('SqlError', Effect.die));
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
