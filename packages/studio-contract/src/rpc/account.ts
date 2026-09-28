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

// Both procedures declare `RateLimited`, and neither handler raises it: the
// only call limit on this tier is the caller's own (#1909), which the
// `Authenticated` middleware charges before either handler runs, and the
// middleware's own error schema carries that refusal to the client
// (`Rpc.ErrorSchema` folds it in). The entries are redundant rather than wrong,
// and are kept because removing them would change the declared unions for no
// behavioural gain.

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
