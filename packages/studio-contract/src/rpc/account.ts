import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

import { Authenticated } from '../middleware/authenticated.ts';
import {
  Me,
  UpdateAccountLocaleInput,
  UpdateAccountLocaleResult,
} from '../schema/account.ts';
import { NotFound, RateLimited } from '../schema/errors.ts';

export const AccountRpcs = RpcGroup.make(
  Rpc.make('me', { success: Me, error: RateLimited }),
  Rpc.make('account.updateLocale', {
    payload: UpdateAccountLocaleInput,
    success: UpdateAccountLocaleResult,
    error: Schema.Union([NotFound, RateLimited]),
  }),
).middleware(Authenticated);
