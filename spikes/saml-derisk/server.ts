// Minimal Hono host for better-auth — the same mounting shape the Studio
// server would use (auth at /api/auth/*).
import { serve } from '@hono/node-server';
import { Hono } from 'hono';

import { auth } from './auth.ts';

const app = new Hono();

app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
app.get('/dashboard', (c) => c.text('signed in'));

serve({ fetch: app.fetch, port: 3005 }, (info) => {
  // oxlint-disable-next-line no-console
  console.log(`saml spike SP listening on http://localhost:${info.port}`);
});
