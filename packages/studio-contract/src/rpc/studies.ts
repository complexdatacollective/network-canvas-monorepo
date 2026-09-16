import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { Authenticated } from '../middleware/authenticated.ts';
import { Conflict, Forbidden, NotFound } from '../schema/errors.ts';
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

// The team's studies (#1262): what a researcher picks their work from, and
// what `/study/$studyId` addresses.
//
// Who sees what is #1257's starter matrix: a team Admin or Owner sees every
// study their team owns, and a team Member sees only the studies they hold a
// study-role grant on. Creation is the Admin/Owner action that decision
// narrowed it to, and the creator receives the study's first Manager grant.
export const StudiesRpcs = RpcGroup.make(
  Rpc.make('studies.list', {
    payload: TeamScoped,
    success: Schema.Array(StudySummary),
    error: Forbidden,
  }),
  /**
   * One study, addressed by study id alone: a study URL is canonical and has
   * to open from a cold navigation that knows no team, so the server
   * resolves the tenant (app-shell design §6.3). A study the caller cannot
   * reach — absent, another team's, or one their team role does not show
   * them — is `Forbidden` in every case, so this is not an existence oracle.
   */
  Rpc.make('studies.get', {
    payload: StudyGetInput,
    success: StudyDetail,
    error: Forbidden,
  }),
  /**
   * How many things are at each countable destination of one study's
   * sidebar. Addressed and refused exactly like `studies.get`: the sidebar
   * renders for whoever can open the study, and a count must not say
   * anything about a study its reader could not open.
   */
  Rpc.make('studies.counts', {
    payload: StudyCountsInput,
    success: StudyCounts,
    error: Schema.Union([Forbidden, NotFound]),
  }),
  /**
   * Creates the study and its protocol line in one transaction, so every
   * study has something to edit and the editor's address is derivable from
   * the study alone.
   */
  Rpc.make('studies.create', {
    payload: CreateStudyInput,
    success: CreateStudyResult,
    error: Schema.Union([Forbidden, Conflict, NotFound, StudyCommandError]),
  }),
).middleware(Authenticated);
