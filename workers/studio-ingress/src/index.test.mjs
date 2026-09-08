import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createManagedStudioIngress } from './index.mjs';

const PUBLIC_ORIGIN = 'https://networkcanvas.studio';
const STATIC_ORIGIN = 'https://networkcanvas-studio.netlify.app';
const BACKEND_ORIGIN = 'https://networkcanvas-studio-production.fly.dev';

function ingress(fetchImpl, overrides = {}) {
  return createManagedStudioIngress({
    publicOrigin: PUBLIC_ORIGIN,
    staticOrigin: STATIC_ORIGIN,
    backendOrigin: BACKEND_ORIGIN,
    originTimeoutMs: 500,
    fetchImpl,
    ...overrides,
  });
}

function serverOrigin(server) {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

test('routes server surfaces to Fly with same-origin auth and CSRF headers intact', async () => {
  const captured = [];
  const router = ingress(async (request) => {
    captured.push(request);
    return new Response(JSON.stringify({ title: 'Missing', status: 404 }), {
      status: 404,
      headers: {
        'content-type': 'application/problem+json',
        'set-cookie': 'studio.session=next; HttpOnly; Secure; SameSite=Lax',
      },
    });
  });
  const response = await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/rpc/team.update?trace=kept`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Research' }),
      headers: {
        'authorization': 'Bearer api-token',
        'cookie': 'studio.session=secret',
        'content-type': 'application/json',
        'origin': PUBLIC_ORIGIN,
        'sec-fetch-site': 'same-origin',
        'x-forwarded-for': '203.0.113.90',
        'x-forwarded-host': 'attacker.invalid',
        'x-forwarded-proto': 'http',
      },
      duplex: 'half',
    }),
  );

  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, `${BACKEND_ORIGIN}/rpc/team.update?trace=kept`);
  assert.equal(captured[0].headers.get('cookie'), 'studio.session=secret');
  assert.equal(captured[0].headers.get('authorization'), 'Bearer api-token');
  assert.equal(captured[0].headers.get('origin'), PUBLIC_ORIGIN);
  assert.equal(captured[0].headers.get('sec-fetch-site'), 'same-origin');
  assert.equal(
    captured[0].headers.get('x-forwarded-host'),
    'networkcanvas.studio',
  );
  assert.equal(captured[0].headers.get('x-forwarded-proto'), 'https');
  assert.equal(captured[0].headers.get('x-forwarded-for'), null);
  assert.deepEqual(await captured[0].json(), { name: 'Research' });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
  assert.match(response.headers.get('set-cookie'), /studio\.session=next/);
  assert.deepEqual(await response.json(), { title: 'Missing', status: 404 });
});

test('keeps authentication cookies and redirects while refusing API caching', async () => {
  const responses = [
    new Response(JSON.stringify({ user: { id: 'researcher' } }), {
      headers: {
        'access-control-allow-credentials': 'true',
        'access-control-allow-origin': PUBLIC_ORIGIN,
        'cache-control': 'public, max-age=3600',
        'content-type': 'application/json',
      },
    }),
    new Response(null, {
      status: 302,
      headers: {
        'location': `${BACKEND_ORIGIN}/dashboard`,
        'set-cookie':
          'studio.session=authenticated; HttpOnly; Secure; SameSite=Lax',
      },
    }),
  ];
  const seen = [];
  const router = ingress(async (request) => {
    seen.push(request);
    return responses.shift();
  });
  const session = await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/api/auth/get-session`, {
      headers: { cookie: 'studio.session=current' },
    }),
  );
  assert.equal(seen[0].headers.get('cookie'), 'studio.session=current');
  assert.equal(session.headers.get('cache-control'), 'no-store');
  assert.equal(session.headers.get('cloudflare-cdn-cache-control'), 'no-store');
  assert.equal(session.headers.get('access-control-allow-credentials'), null);
  assert.equal(session.headers.get('access-control-allow-origin'), null);

  const login = await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/api/auth/sign-in/email`, {
      method: 'POST',
      body: '{}',
      headers: {
        'content-type': 'application/json',
        'origin': PUBLIC_ORIGIN,
        'sec-fetch-site': 'same-origin',
      },
    }),
  );
  assert.equal(login.headers.get('location'), `${PUBLIC_ORIGIN}/dashboard`);
  assert.match(
    login.headers.get('set-cookie'),
    /studio\.session=authenticated/,
  );
  assert.equal(login.headers.get('cache-control'), 'no-store');
});

test('sends only an explicit public header allowlist to the Netlify static origin', async () => {
  let captured;
  const router = ingress(async (request) => {
    captured = request;
    return new Response('<html>Studio</html>', {
      headers: {
        'cache-control': 'public, max-age=60',
        'content-type': 'text/html',
        'set-cookie': 'static-origin=must-not-reach-browser',
        'access-control-allow-origin': '*',
      },
    });
  });
  const response = await router.fetch(
    new Request(
      `${PUBLIC_ORIGIN}/sign-in?invitationId=private-invitation&error=access_denied`,
      {
        headers: {
          'accept': 'text/html',
          'authorization': 'Bearer private',
          'cookie': 'studio.session=secret',
          'origin': 'https://foreign.example',
          'referer': `${PUBLIC_ORIGIN}/private/team`,
          'x-csrf-token': 'private-csrf',
        },
      },
    ),
  );

  assert.equal(captured.url, `${STATIC_ORIGIN}/sign-in`);
  assert.equal(captured.headers.get('accept'), 'text/html');
  for (const header of [
    'authorization',
    'cookie',
    'origin',
    'referer',
    'x-csrf-token',
  ])
    assert.equal(captured.headers.get(header), null, header);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=60');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(await response.text(), '<html>Studio</html>');
});

test('refuses static mutations without sending their body or credentials upstream', async () => {
  let calls = 0;
  const router = ingress(async () => {
    calls += 1;
    return new Response(null);
  });
  const response = await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/sign-in`, {
      method: 'POST',
      body: 'secret',
      headers: { cookie: 'studio.session=secret' },
    }),
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
  assert.equal(calls, 0);
});

test('server prefixes and operational paths cannot fall through to the SPA', async () => {
  const destinations = [];
  const router = ingress(async (request) => {
    destinations.push(new URL(request.url).origin);
    return new Response(null, { status: 404 });
  });
  for (const path of [
    '/api',
    '/api/unknown',
    '/rpc',
    '/rpc/unknown',
    '/storage',
    '/storage/missing',
    '/healthz',
    '/healthz/unknown',
    '/readyz',
    '/readyz/unknown',
    '/metrics',
    '/metrics/unknown',
  ]) {
    const response = await router.fetch(new Request(`${PUBLIC_ORIGIN}${path}`));
    assert.equal(response.status, 404, path);
  }
  await router.fetch(new Request(`${PUBLIC_ORIGIN}/apiology`));
  assert.deepEqual(destinations, [
    ...Array(12).fill(BACKEND_ORIGIN),
    STATIC_ORIGIN,
  ]);
});

test('passes a valid same-origin WebSocket upgrade through unchanged', async () => {
  const socket = { close() {} };
  const upgradeResponse = { status: 101, webSocket: socket };
  let captured;
  const router = ingress(async (request) => {
    captured = request;
    return upgradeResponse;
  });
  const response = await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/ws`, {
      headers: {
        'cookie': 'studio.session=secret',
        'origin': PUBLIC_ORIGIN,
        'upgrade': 'websocket',
        'sec-websocket-key': 'synthetic-key',
        'sec-websocket-protocol': 'studio-sync',
        'sec-websocket-version': '13',
      },
    }),
  );
  assert.equal(response, upgradeResponse);
  assert.equal(captured.url, `${BACKEND_ORIGIN}/ws`);
  assert.equal(captured.headers.get('upgrade'), 'websocket');
  assert.equal(captured.headers.get('origin'), PUBLIC_ORIGIN);
  assert.equal(captured.headers.get('cookie'), 'studio.session=secret');
  assert.equal(captured.headers.get('sec-websocket-protocol'), 'studio-sync');
});

test('refuses cross-origin, misplaced and malformed WebSocket upgrades before fetch', async () => {
  let calls = 0;
  const router = ingress(async () => {
    calls += 1;
    return new Response(null);
  });
  const cases = [
    new Request(`${PUBLIC_ORIGIN}/ws`, {
      headers: { origin: 'https://foreign.example', upgrade: 'websocket' },
    }),
    new Request(`${PUBLIC_ORIGIN}/assets/app.js`, {
      headers: { origin: PUBLIC_ORIGIN, upgrade: 'websocket' },
    }),
    new Request(`${PUBLIC_ORIGIN}/ws`, {
      headers: { origin: PUBLIC_ORIGIN },
    }),
    new Request(`${PUBLIC_ORIGIN}/ws/other`, {
      headers: { origin: PUBLIC_ORIGIN, upgrade: 'websocket' },
    }),
  ];
  const statuses = [];
  for (const request of cases)
    statuses.push((await router.fetch(request)).status);
  assert.deepEqual(statuses, [403, 400, 426, 400]);
  assert.equal(calls, 0);
});

test('refuses an upstream that does not complete the WebSocket handshake', async () => {
  const router = ingress(
    async () => new Response('upgrade unavailable', { status: 503 }),
  );
  const response = await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/ws`, {
      headers: { origin: PUBLIC_ORIGIN, upgrade: 'websocket' },
    }),
  );
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    title: 'Backend refused the WebSocket upgrade',
    status: 502,
  });
});

test('fails closed on unapproved hosts, upstreams, placeholders and ambiguous paths', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(null);
  };
  const cases = [
    ingress(fetchImpl, { publicOrigin: 'https://preview.example' }),
    ingress(fetchImpl, { staticOrigin: 'https://static.example' }),
    ingress(fetchImpl, { backendOrigin: 'https://backend.example' }),
    ingress(fetchImpl, {
      backendOrigin: 'https://replace-with-production-app.fly.dev',
    }),
    createManagedStudioIngress(null),
  ];
  for (const router of cases) {
    const response = await router.fetch(new Request(`${PUBLIC_ORIGIN}/`));
    assert.equal(response.status, 503);
  }
  assert.equal(
    (await ingress(fetchImpl).fetch(new Request('https://foreign.example/')))
      .status,
    421,
  );
  assert.equal(
    (
      await ingress(fetchImpl).fetch(
        new Request(`${PUBLIC_ORIGIN}/api%2Fauth/session`),
      )
    ).status,
    400,
  );
  assert.equal(calls, 0);
});

test('normalizes repeated path separators before selecting an origin', async () => {
  let captured;
  const router = ingress(async (request) => {
    captured = request;
    return new Response(null, { status: 404 });
  });
  await router.fetch(new Request(`${PUBLIC_ORIGIN}//api//v1/status`));
  assert.equal(captured.url, `${BACKEND_ORIGIN}/api/v1/status`);
});

test('returns a same-host HTTPS redirect without forwarding HTTP credentials', async () => {
  let calls = 0;
  const router = ingress(async () => {
    calls += 1;
    return new Response(null);
  });
  const response = await router.fetch(
    new Request('http://networkcanvas.studio:8080/rpc/status?fresh=true', {
      headers: { cookie: 'studio.session=secret' },
    }),
  );
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get('location'),
    `${PUBLIC_ORIGIN}/rpc/status?fresh=true`,
  );
  assert.equal(calls, 0);
});

test('keeps network-path and encoded separator redirects on the approved host', async () => {
  let calls = 0;
  const router = ingress(async () => {
    calls += 1;
    return new Response(null);
  });
  const duplicate = await router.fetch(
    new Request('http://networkcanvas.studio//evil.example/path?next=1'),
  );
  assert.equal(duplicate.status, 308);
  assert.equal(
    duplicate.headers.get('location'),
    `${PUBLIC_ORIGIN}/evil.example/path?next=1`,
  );
  const encoded = await router.fetch(
    new Request('http://networkcanvas.studio/%2f%2fevil.example/path'),
  );
  assert.equal(encoded.status, 400);
  assert.equal(calls, 0);
});

test('rewrites upstream redirects without leaking origin hostnames', async () => {
  const responses = [
    Response.redirect(`${BACKEND_ORIGIN}/api/auth/callback`, 302),
    Response.redirect('https://accounts.google.com/oauth', 302),
    Response.redirect('https://foreign.example/rpc', 302),
    Response.redirect(`${STATIC_ORIGIN}/sign-in`, 301),
    Response.redirect('https://foreign.example/static', 302),
    new Response(null, {
      status: 302,
      headers: { location: 'javascript:alert(1)' },
    }),
  ];
  const router = ingress(async () => responses.shift());
  const backend = await router.fetch(new Request(`${PUBLIC_ORIGIN}/api/auth`));
  assert.equal(
    backend.headers.get('location'),
    `${PUBLIC_ORIGIN}/api/auth/callback`,
  );
  const oauth = await router.fetch(new Request(`${PUBLIC_ORIGIN}/api/auth`));
  assert.equal(
    oauth.headers.get('location'),
    'https://accounts.google.com/oauth',
  );
  const foreignBackend = await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/rpc/foreign`),
  );
  assert.equal(foreignBackend.status, 502);
  const staticRedirect = await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/old`),
  );
  assert.equal(
    staticRedirect.headers.get('location'),
    `${PUBLIC_ORIGIN}/sign-in`,
  );
  const refused = await router.fetch(new Request(`${PUBLIC_ORIGIN}/foreign`));
  assert.equal(refused.status, 502);
  const unsafe = await router.fetch(new Request(`${PUBLIC_ORIGIN}/api/unsafe`));
  assert.equal(unsafe.status, 502);
});

test('bounds origin header waits and cancels a late body', async () => {
  let resolveFetch;
  let cancelled = false;
  const router = ingress(
    () =>
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    { originTimeoutMs: 20 },
  );
  const started = Date.now();
  const response = await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/api/status`),
  );
  assert.equal(response.status, 504);
  assert.ok(Date.now() - started < 500);
  resolveFetch(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    ),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
});

test('does not apply the header timeout to a response body stream', async () => {
  const router = ingress(
    async () =>
      new Response(
        new ReadableStream({
          async start(controller) {
            await new Promise((resolve) => setTimeout(resolve, 40));
            controller.enqueue(new TextEncoder().encode('streamed'));
            controller.close();
          },
        }),
      ),
    { originTimeoutMs: 20 },
  );
  const response = await router.fetch(new Request(`${PUBLIC_ORIGIN}/asset.js`));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'streamed');
});

test('streams real HTTP origin responses without converting backend failures to HTML', async (t) => {
  const staticServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<html>Netlify static</html>');
  });
  const backendServer = createServer((request, response) => {
    assert.equal(request.headers.origin, PUBLIC_ORIGIN);
    response.writeHead(404, { 'content-type': 'application/problem+json' });
    response.end(
      JSON.stringify({ title: 'Backend route missing', status: 404 }),
    );
  });
  await Promise.all([
    new Promise((resolve) => staticServer.listen(0, '127.0.0.1', resolve)),
    new Promise((resolve) => backendServer.listen(0, '127.0.0.1', resolve)),
  ]);
  t.after(() => {
    staticServer.close();
    backendServer.close();
  });
  const router = ingress((request) => {
    const requested = new URL(request.url);
    const local = new URL(
      requested.pathname + requested.search,
      requested.origin === STATIC_ORIGIN
        ? serverOrigin(staticServer)
        : serverOrigin(backendServer),
    );
    return fetch(local, {
      method: request.method,
      headers: request.headers,
      body: requestBodyForTest(request),
      duplex: 'half',
      redirect: 'manual',
    });
  });

  const page = await router.fetch(new Request(`${PUBLIC_ORIGIN}/studies`));
  assert.equal(page.status, 200);
  assert.equal(await page.text(), '<html>Netlify static</html>');
  const missingApi = await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/api/missing`, {
      headers: { origin: PUBLIC_ORIGIN },
    }),
  );
  assert.equal(missingApi.status, 404);
  assert.equal(
    missingApi.headers.get('content-type'),
    'application/problem+json',
  );
  assert.deepEqual(await missingApi.json(), {
    title: 'Backend route missing',
    status: 404,
  });
});

function requestBodyForTest(request) {
  return request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : request.body;
}
