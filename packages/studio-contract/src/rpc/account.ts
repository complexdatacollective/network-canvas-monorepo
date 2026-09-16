import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { Authenticated } from '../middleware/authenticated.ts';
import {
  Me,
  UpdateAccountLocaleInput,
  UpdateAccountLocaleResult,
} from '../schema/account.ts';
import { NotFound } from '../schema/errors.ts';

// The caller's own account: personal, not team-scoped, so these take no
// teamId and need only a signed-in user. Deliberately unaudited (2026-09-04
// localization design §5.2, decision 7): the audit log is study/team-scoped
// by design, and a personal presentation preference has no tenant and no
// research-data significance.

export const AccountRpcs = RpcGroup.make(
  /** The signed-in researcher; refuses `Unauthorized` without a session. */
  Rpc.make('me', { success: Me }),
  /**
   * Stores the caller's UI-language preference; null reverts to browser
   * negotiation ("Automatic"). `me` reports the stored value.
   */
  Rpc.make('account.updateLocale', {
    payload: UpdateAccountLocaleInput,
    success: UpdateAccountLocaleResult,
    error: NotFound,
  }),
).middleware(Authenticated);
