import { Rpc, RpcGroup } from 'effect/rpc';

import { InstanceStatus } from '../schema/status.ts';

export const StatusRpcs = RpcGroup.make(
  Rpc.make('status', { success: InstanceStatus }),
);
