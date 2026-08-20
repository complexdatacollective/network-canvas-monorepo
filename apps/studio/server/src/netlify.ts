import { createApp } from './app.ts';
import { createPool } from './db/pool.ts';
import { readEnv } from './env.ts';

// Deliberately NOT ported from src/index.ts:
//   - serveStatic / SPA fallback — Netlify's CDN serves apps/studio/client/dist
//   - checkSchema — there is no boot in a serverless runtime; apply the
//     schema once against the database out of band
//     (`pnpm --filter @codaco/studio-server apply-schema`) rather than
//     verifying on every cold start. That command is also the only place this
//     lane ever detects a stale schema.
//   - the WebSocket server and shutdown drain — /ws cannot be served here and
//     is excluded from `config.path` below

const env = readEnv();
const pool = env.db ? createPool(env.db) : undefined;
const app = createApp(env, { pool });

export default async function handler(request: Request): Promise<Response> {
  return app.fetch(request);
}

// URLPattern, so `/api/*` matches `/api/` and below but not the bare `/api`.
// The bare prefixes are listed too, otherwise they fall through to the SPA
// redirect and a machine caller gets 200 and the app shell where src/app.ts
// answers 404 problem JSON.
export const config = {
  path: [
    '/api',
    '/api/*',
    '/rpc',
    '/rpc/*',
    '/storage',
    '/storage/*',
    '/healthz',
  ],
};
