import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

import { Authenticated } from '../middleware/authenticated.ts';
import {
  Conflict,
  Forbidden,
  NotFound,
  RateLimited,
} from '../schema/errors.ts';
import {
  CreateStudyInput,
  CreateStudyResult,
  StudyCommandError,
  StudyCounts,
  StudyCountsInput,
  StudyDetail,
  StudyGetInput,
  StudySummary,
} from '../schema/study.ts';
import { TeamScoped } from '../schema/team.ts';

export const StudiesRpcs = RpcGroup.make(
  Rpc.make('studies.list', {
    payload: TeamScoped,
    success: Schema.Array(StudySummary),
    error: Schema.Union([Forbidden, RateLimited]),
  }),
  Rpc.make('studies.get', {
    payload: StudyGetInput,
    success: StudyDetail,
    error: Schema.Union([Forbidden, RateLimited]),
  }),
  Rpc.make('studies.counts', {
    payload: StudyCountsInput,
    success: StudyCounts,
    error: Schema.Union([Forbidden, NotFound, RateLimited]),
  }),
  Rpc.make('studies.create', {
    payload: CreateStudyInput,
    success: CreateStudyResult,
    error: Schema.Union([
      Forbidden,
      Conflict,
      NotFound,
      RateLimited,
      StudyCommandError,
    ]),
  }),
).middleware(Authenticated);
