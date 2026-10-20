import type { Config } from '@netlify/functions';

import { handlePreference } from '../../src/server/handlers.ts';
import { jobStore, logStore } from '../../src/server/jobs.ts';

// POST /api/preference: which of two compared runs the researcher picked.
export default async (req: Request): Promise<Response> =>
  handlePreference(req, { jobs: jobStore(), log: logStore() });

export const config: Config = {
  path: '/api/preference',
  method: 'POST',
  rateLimit: { windowSize: 60, windowLimit: 20, aggregateBy: ['ip', 'domain'] },
};
