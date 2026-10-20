import type { Config } from '@netlify/functions';

import { handleConfig } from '../../src/server/handlers.ts';
import { createDefaultAdapters } from '../../src/server/providers/adapters.ts';

// GET /api/config: which providers have keys, and their model labels.
export default async (): Promise<Response> =>
  handleConfig(createDefaultAdapters());

export const config: Config = {
  path: '/api/config',
  method: 'GET',
};
