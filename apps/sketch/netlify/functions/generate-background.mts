import { handleGenerate } from '../../src/server/handlers.ts';
import { jobStore, logStore } from '../../src/server/jobs.ts';
import { createDefaultAdapters } from '../../src/server/providers/adapters.ts';

// Runs one job for up to 15 minutes. The -background filename suffix is what
// makes it a background function: config.background is killed at 60 s
// (netlify/cli#8354), so this file deliberately exports no config. Netlify
// retries a background function that fails; the handler is idempotent and
// never throws.
export default async (req: Request): Promise<Response> =>
  handleGenerate(req, {
    jobs: jobStore(),
    log: logStore(),
    adapters: createDefaultAdapters(),
  });
