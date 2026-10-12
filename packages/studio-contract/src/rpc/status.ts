import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

import { Authenticated } from '../middleware/authenticated.ts';
import { RateLimited } from '../schema/errors.ts';
import { InstanceStatus, UpdateAvailable } from '../schema/status.ts';

// Two groups, as `ParticipantRpcs` is: `.middleware()` applies to every rpc
// added so far, and `status` must stay public (the sign-in screen and the
// maintenance gate read it before anyone is signed in).
const PublicStatusRpcs = RpcGroup.make(
  Rpc.make('status', { success: InstanceStatus }),
);

const OwnerStatusRpcs = RpcGroup.make(
  Rpc.make('status.updateAvailable', {
    success: Schema.NullOr(UpdateAvailable),
    error: RateLimited,
  }),
).middleware(Authenticated);

export const StatusRpcs = PublicStatusRpcs.merge(OwnerStatusRpcs);
