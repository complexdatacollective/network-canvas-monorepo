import { Effect, Schema } from 'effect';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { StudiesRpcs } from '@codaco/studio-contract/rpc/studies';
import { NotFound } from '@codaco/studio-contract/schema/errors';
import {
  CreateStudyResult,
  StudyCommandError,
  StudyDetail,
  StudySummary,
} from '@codaco/studio-contract/schema/study';

import { AuditCommandTeamNotFoundError } from '../../audit/command.ts';
import {
  createAuditedStudy,
  StudyCommandError as StudyCommandFailure,
} from '../../study/commands.ts';
import { readStudyCounts } from '../../study/counts.ts';
import { StudyStore } from '../../study/store.ts';
import { seesEveryTeamStudy } from '../../study/tenancy.ts';
import { requireCipher, runCommand } from '../bridge.ts';
import type { RpcDeps } from '../deps.ts';
import { openStudy, openTeam } from '../team-scope.ts';

/**
 * A study command's own vocabulary, no longer flattened into a transport code:
 * a duplicate study id is `StudyCommandError({ code: 'CONFLICT' })`, and a
 * locked membership that lost the role is `{ code: 'FORBIDDEN' }`. A team row
 * that went away under the command is the shared `NotFound`.
 */
const studyRefusal = (
  cause: unknown,
): Effect.Effect<never, NotFound | StudyCommandError> => {
  if (cause instanceof AuditCommandTeamNotFoundError) return new NotFound({});
  if (!(cause instanceof StudyCommandFailure)) return Effect.die(cause);
  return new StudyCommandError({ code: cause.code });
};

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
        const scope = yield* openTeam(deps, yield* Principal, payload.teamId);
        return decodeSummaries(
          yield* Effect.promise(() =>
            new StudyStore(scope.tenantDb).listStudies({
              actorUserId: scope.principal.userId,
              seesEveryStudy: seesEveryTeamStudy(scope.team.role),
            }),
          ),
        );
      }),
    'studies.get': (payload) =>
      Effect.gen(function* () {
        const scope = yield* openStudy(deps, yield* Principal, payload.studyId);
        const { protocolDraftId, ...study } = scope.study;
        return decodeDetail({ teamId: scope.team.id, study, protocolDraftId });
      }),
    // Resolved like `get`, so the numbers beside the sidebar's destinations
    // exist for exactly the studies their reader can open, and a study the
    // caller cannot reach is refused the same way for both.
    'studies.counts': (payload) =>
      Effect.gen(function* () {
        const scope = yield* openStudy(deps, yield* Principal, payload.studyId);
        const counts = yield* Effect.promise(() =>
          readStudyCounts(scope.tenantDb, scope.study.id),
        );
        // `openStudy` found the row inside this tenant a moment ago; a row
        // missing now is a purge racing the read, not an oracle.
        if (!counts) return yield* new NotFound({});
        return counts;
      }),
    'studies.create': (payload) =>
      Effect.gen(function* () {
        const scope = yield* openTeam(deps, yield* Principal, payload.teamId);
        const cipher = yield* requireCipher(deps);
        return decodeCreated(
          yield* runCommand(
            () =>
              createAuditedStudy(
                {
                  tenantDb: scope.tenantDb,
                  principal: scope.principal,
                  requestId: scope.requestId,
                },
                payload,
                cipher,
              ),
            studyRefusal,
          ),
        );
      }),
  });
