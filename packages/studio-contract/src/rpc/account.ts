import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { Authenticated } from '../middleware/authenticated.ts';
import {
  Me,
  UpdateAccountLocaleInput,
  UpdateAccountLocaleResult,
} from '../schema/account.ts';
import { NotFound, RateLimited } from '../schema/errors.ts';

// The caller's own account: personal, not team-scoped, so these take no
// teamId and need only a signed-in user. Deliberately unaudited (2026-09-04
// localization design §5.2, decision 7): the audit log is study/team-scoped
// by design, and a personal presentation preference has no tenant and no
// research-data significance.

// Every procedure here declares `RateLimited` as well as its own refusals. The
// per-user and per-team call limits (#1909) are charged inside the handlers
// that resolve the caller's team, not inside the `Authenticated` middleware, and
// `Rpc.ToHandlerFn` types a handler's error channel from the rpc's OWN error
// schema rather than from `Rpc.ErrorSchema` — which is what folds a middleware's
// errors in. So a refusal the middleware's schema would happily encode still has
// to be declared here for a handler to be able to raise it.

export const AccountRpcs = RpcGroup.make(
  /** The signed-in researcher; refuses `Unauthorized` without a session. */
  Rpc.make('me', { success: Me, error: RateLimited }),
  /**
   * Stores the caller's UI-language preference; null reverts to browser
   * negotiation ("Automatic"). `me` reports the stored value.
   */
  Rpc.make('account.updateLocale', {
    payload: UpdateAccountLocaleInput,
    success: UpdateAccountLocaleResult,
    error: Schema.Union([NotFound, RateLimited]),
  }),
).middleware(Authenticated);
