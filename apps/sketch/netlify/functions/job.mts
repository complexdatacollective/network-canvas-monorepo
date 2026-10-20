import type { Config, Context } from '@netlify/functions';

import { handleGetJob } from '../../src/server/handlers.ts';
import { jobStore } from '../../src/server/jobs.ts';

// GET /api/jobs/:id: the page polls this for progress and the result.
export default async (_req: Request, context: Context): Promise<Response> =>
  handleGetJob(context.params.id, { jobs: jobStore() });

export const config: Config = {
  path: '/api/jobs/:id',
  method: 'GET',
};
