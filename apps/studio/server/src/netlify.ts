import { createApp } from './app.ts';
import { readEnv } from './env.ts';

// Deliberately NOT ported from src/index.ts:
//   - serveStatic / SPA fallback — Netlify's CDN serves apps/studio/client/dist
//   - checkSchema — this lane holds no database at all (see below), so there
//     is no schema to verify on a cold start
//   - the WebSocket server and shutdown drain — /ws cannot be served here and
//     is excluded from `config.path` below
//   - background invitation delivery — no durable scheduler invokes this
//     function, so RPC invitation creation is explicitly unavailable rather
//     than committing an outbox job that nothing can drain

// This lane runs with no database and auth off, for the reason netlify.toml
// states at length: PUBLIC_URL has to match the origin the browser used, and a
// deploy preview's origin is per-PR, so a configured database here mints
// cookies and magic-link URLs for the wrong host and makes the CSRF check
// refuse the preview's own requests.
//
// That used to rest on the Netlify site simply not defining DATABASE_URL, with
// nothing enforcing it. Site-level environment variables are edited outside
// this repository, so the invariant broke silently: with a database configured
// but unusable from the function, better-auth answered /api/auth/get-session
// with a 500, which the client reads as an unreachable server and replaces the
// whole app with its "server could not be reached" screen — on production as
// well as on previews. Drop the two surfaces here so the lane's documented
// degradation is what actually runs: /api/auth/* refuses with 503, which the
// client treats as a reachable server reporting nobody signed in (see
// probeSession in client/src/router.tsx), and no CSRF gate is mounted against
// an origin the preview cannot match.
//
// The settings are withheld from the read rather than blanked on its result,
// because reading them is itself what fails: a database without a signing
// secret or a public URL, a half-configured social provider, or a malformed
// value of any of them throws while this module is still initializing, and a
// function whose module init throws serves nothing at all — not even the 503
// this lane is meant to answer with. See readEnv's ReadEnvOptions.
//
// Serving auth from this lane needs the origin derived from the request, which
// netlify.toml assigns to the real topology work — not a site-level variable.
const env = readEnv({ withoutDatabaseOrAuth: true });
const app = createApp(env, { invitationDeliveryAvailable: false });

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
