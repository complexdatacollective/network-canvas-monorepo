import { implement } from '@orpc/server';

import { contract } from '@codaco/studio-rpc';

import { getInstanceStatus } from './domain.ts';

// The SPA's internal surface: the server-side implementation of the
// @codaco/studio-rpc contract, mounted at /rpc (src/app.ts). Unpublished and
// free-moving within the deploy-compatibility rules on #1245 — its only
// client is the Studio SPA. Handlers are thin adapters over the domain layer
// (src/domain.ts).

const os = implement(contract);

export const rpcRouter = {
  status: os.status.handler(() => getInstanceStatus()),
};
