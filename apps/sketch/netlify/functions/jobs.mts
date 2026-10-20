import type { Config } from '@netlify/functions';

import { handleCreateJob } from '../../src/server/handlers.ts';
import { jobStore, logStore } from '../../src/server/jobs.ts';
import { createDefaultAdapters } from '../../src/server/providers/adapters.ts';

// POST /api/jobs: validate, check the daily budget, queue the job and hand it
// to generate-background, which answers 202 at once.
export default async (req: Request): Promise<Response> =>
  handleCreateJob(req, {
    jobs: jobStore(),
    log: logStore(),
    adapters: createDefaultAdapters(),
    startBackground: async (jobId) => {
      const response = await fetch(
        new URL('/.netlify/functions/generate-background', req.url),
        { method: 'POST', body: JSON.stringify({ jobId }) },
      );
      if (!response.ok) {
        throw new Error(`generate-background answered ${response.status}`);
      }
    },
  });

export const config: Config = {
  path: '/api/jobs',
  method: 'POST',
  rateLimit: { windowSize: 60, windowLimit: 4, aggregateBy: ['ip', 'domain'] },
};
