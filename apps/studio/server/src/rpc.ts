import { implement } from '@orpc/server';

import { contract } from '../../shared/contract.ts';
import { STUDIO_VERSION } from './version.ts';

const os = implement(contract);

export const rpcRouter = {
  status: os.status.handler(() => ({
    name: 'Network Canvas Studio',
    version: STUDIO_VERSION,
  })),
};
