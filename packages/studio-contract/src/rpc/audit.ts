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
import { Forbidden, NotFound, RateLimited } from '../schema/errors.ts';
import { TeamScoped } from '../schema/team.ts';

// The team's immutable activity record. Reads require the audit.read
// permission (built-in owner/admin until #1257); ordering and cursors are
// per-team sequences, never timestamps.
//
// Every audit denial is `Forbidden` and nothing else, including the
// denial-rate-limit refusal; `AuditReadDenied`/`AuditTeamNotFound` are
// internal to the read path and never declared here. `RateLimited` is a
// different thing entirely: the per-user and per-team CALL limits (#1909),
// charged by the handler that resolves the caller's team before any audit row
// is read.
// Every procedure here declares `RateLimited` as well as its own refusals. The
// per-user and per-team call limits (#1909) are charged inside the handlers
// that resolve the caller's team, not inside the `Authenticated` middleware, and
// `Rpc.ToHandlerFn` types a handler's error channel from the rpc's OWN error
// schema rather than from `Rpc.ErrorSchema` — which is what folds a middleware's
// errors in. So a refusal the middleware's schema would happily encode still has
// to be declared here for a handler to be able to raise it.
export const AuditRpcs = RpcGroup.make(
  Rpc.make('audit.list', {
    payload: AuditListInput,
    success: AuditListOutput,
    error: Schema.Union([Forbidden, NotFound, RateLimited]),
  }),
  Rpc.make('audit.get', {
    payload: AuditGetInput,
    success: AuditEventDetail,
    error: Schema.Union([Forbidden, NotFound, RateLimited]),
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
    error: Schema.Union([Forbidden, RateLimited]),
  }),
).middleware(Authenticated);
