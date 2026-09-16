import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { InstanceStatus } from '../schema/status.ts';

// The one procedure an instance answers before anyone has signed in: no
// payload, no error channel, no middleware. Served on the rpc plane at
// `/rpc`; the narrower `PublicInstanceStatus` document is what `/api/v1`
// publishes instead.

export const StatusRpcs = RpcGroup.make(
  Rpc.make('status', { success: InstanceStatus }),
);
