import { createApp } from './app.ts';
import { createPool } from './db/pool.ts';
import { readEnv } from './env.ts';

// Netlify Functions entry — the serverless deployment of the same Hono app
// `src/index.ts` serves from a persistent Node process. Functions v2 handlers
// are Web-standard Request/Response, so `app.fetch` is the whole adapter; the
// Node-specific concerns of the persistent entry are the CDN's job or do not
// exist here.
//
// Deliberately NOT ported from src/index.ts:
//   - serveStatic / SPA fallback — Netlify's CDN serves apps/studio/client/dist
//   - applyAuthSchema — there is no boot in a serverless runtime; run it once
//     against the database out of band (`pnpm --filter @codaco/studio-server
//     apply-schema`) rather than on every cold start
//   - the WebSocket server and shutdown drain — /ws cannot be served here and
//     is excluded from `config.path` below

const env = readEnv();
const pool = env.db ? createPool(env.db) : undefined;
const app = createApp(env, { pool });

export default async function handler(request: Request): Promise<Response> {
  return app.fetch(request);
}

export const config = {
  path: ['/api/*', '/rpc/*', '/storage/*', '/healthz'],
};
