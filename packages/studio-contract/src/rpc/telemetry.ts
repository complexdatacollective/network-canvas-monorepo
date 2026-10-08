import { Rpc, RpcGroup } from 'effect/rpc';

import { RateLimited } from '../schema/errors.ts';
import { ErrorReport } from '../schema/telemetry.ts';

export const TelemetryRpcs = RpcGroup.make(
  Rpc.make('telemetry.report', {
    payload: ErrorReport,
    error: RateLimited,
  }),
);
