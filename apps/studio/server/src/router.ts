import { implement } from '@orpc/server';

import { contract } from '../../shared/contract.ts';
import { STUDIO_VERSION } from './version.ts';

const os = implement(contract);

// One implementation serves both surfaces: the SPA's RPC endpoint and the
// public REST API (see server/src/api.ts).
export const appRouter = {
  status: os.status.handler(() => ({
    name: 'Network Canvas Studio',
    version: STUDIO_VERSION,
  })),
};
