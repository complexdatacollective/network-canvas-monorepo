import { Effect } from 'effect';

import { StatusRpcs } from '@codaco/studio-contract/rpc/status';

import { getInstanceStatus } from '../../domain.ts';
import type { RpcDeps } from '../deps.ts';

/**
 * The one procedure an instance answers before anyone has signed in: no
 * payload, no error channel, no middleware.
 *
 * `readInstallation` is the reader `createStudio` built, which answers `null`
 * for a database it cannot read — `status` is what a browser asks before it can
 * render anything at all, including the screen that explains an outage.
 */
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
