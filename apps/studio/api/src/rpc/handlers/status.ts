import { Effect } from 'effect';

import { StatusRpcs } from '@codaco/studio-contract/rpc/status';

import { getInstanceStatus } from '../../domain.ts';
import type { RpcDeps } from '../deps.ts';

export const StatusHandlers = (deps: RpcDeps) =>
  StatusRpcs.toLayer({
    status: () =>
      Effect.promise(async () =>
        getInstanceStatus(
          deps.capabilities,
          deps.deployment,
          await deps.readInstallation(),
        ),
      ),
  });
