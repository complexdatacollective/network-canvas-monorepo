import { Effect } from 'effect';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { StatusRpcs } from '@codaco/studio-contract/rpc/status';

import { readLatestRelease } from '../../db/deployment-state.ts';
import { getInstanceStatus } from '../../domain.ts';
import { isNewer } from '../../update/manifest.ts';
import { STUDIO_VERSION } from '../../version.ts';
import type { RpcDeps } from '../deps.ts';

export const StatusHandlers = (deps: RpcDeps) =>
  StatusRpcs.toLayer({
    'status': () =>
      Effect.map(deps.readInstallation, (installation) =>
        getInstanceStatus(deps.capabilities, deps.deployment, installation),
      ),
    // Only the installation's owner is told. There is no owner role: the owner
    // is the one user `installation.owner_user_id` names, so everyone else
    // (and an instance still in first-run setup, which has no owner) gets
    // `null` without the stored release being read.
    //
    // "Newer" is judged here, at read time, against the version this process
    // is running, not when the worker recorded the release: the row outlives
    // the upgrade that makes it stale, and an owner who has just upgraded must
    // stop being told about the release they are now running.
    'status.updateAvailable': () =>
      Effect.gen(function* () {
        const principal = yield* Principal;
        const installation = yield* deps.readInstallation;
        if (installation?.ownerUserId !== principal.userId) return null;
        const latest = yield* Effect.orDie(readLatestRelease());
        if (latest === null || !isNewer(latest.version, STUDIO_VERSION)) {
          return null;
        }
        return latest;
      }),
  });
