import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { Authenticated } from '../middleware/authenticated.ts';
import {
  AuditEventDetail,
  AuditFilterOptions,
  AuditGetInput,
  AuditListInput,
  AuditListOutput,
} from '../schema/audit.ts';
import { Forbidden, NotFound } from '../schema/errors.ts';
import { TeamScoped } from '../schema/team.ts';

// The team's immutable activity record. Reads require the audit.read
// permission (built-in owner/admin until #1257); ordering and cursors are
// per-team sequences, never timestamps.
//
// Every audit denial is `Forbidden` and nothing else, including the
// denial-rate-limit refusal; `AuditReadDenied`/`AuditTeamNotFound` are
// internal to the read path and never declared here.
export const AuditRpcs = RpcGroup.make(
  Rpc.make('audit.list', {
    payload: AuditListInput,
    success: AuditListOutput,
    error: Schema.Union([Forbidden, NotFound]),
  }),
  Rpc.make('audit.get', {
    payload: AuditGetInput,
    success: AuditEventDetail,
    error: Schema.Union([Forbidden, NotFound]),
  }),
  /**
   * The values the list filters can take, over the team's whole history. A
   * separate procedure, not a field on the list response: the option set is
   * invariant across pages and across filter changes, so folding it into
   * `audit.list` would re-run two aggregate queries on every "Load more" and
   * on every filter apply, and would make the options narrow to whatever the
   * current filter already matched.
   */
  Rpc.make('audit.filterOptions', {
    payload: TeamScoped,
    success: AuditFilterOptions,
    error: Forbidden,
  }),
).middleware(Authenticated);
