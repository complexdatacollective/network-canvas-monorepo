import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createManagedStudioIngress } from './index.mjs';

const PUBLIC_ORIGIN = 'https://networkcanvas.studio';
const STATIC_ORIGIN = 'https://networkcanvas-studio.netlify.app';
const BACKEND_ORIGIN = 'https://networkcanvas-studio-production.fly.dev';
const INGRESS_SECRET = 'synthetic-ingress-secret-at-least-32-characters';
const CLIENT_IP = '203.0.113.80';

function ingress(fetchImpl, overrides = {}) {
  const { edgeClientIp = CLIENT_IP, ...configuration } = overrides;
  const router = createManagedStudioIngress({
    publicOrigin: PUBLIC_ORIGIN,
    staticOrigin: STATIC_ORIGIN,
    backendOrigin: BACKEND_ORIGIN,
    backendIngressSecret: INGRESS_SECRET,
    originTimeoutMs: 500,
    fetchImpl,
    ...configuration,
  });
  return {
    fetch(request) {
      if (edgeClientIp === false) return router.fetch(request);
      const headers = new Headers(request.headers);
      if (!headers.has('cf-connecting-ip'))
        headers.set('cf-connecting-ip', edgeClientIp);
      return router.fetch(new Request(request, { headers }));
    },
  };
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
        'x-request-id': '123e4567-e89b-42d3-a456-426614174000',
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
  assert.equal(captured[0].headers.get('x-forwarded-for'), CLIENT_IP);
  assert.equal(
    captured[0].headers.get('x-studio-managed-ingress-proof'),
    INGRESS_SECRET,
  );
  assert.notEqual(
    captured[0].headers.get('x-request-id'),
    '123e4567-e89b-42d3-a456-426614174000',
  );
  assert.match(
    captured[0].headers.get('x-request-id'),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.deepEqual(await captured[0].json(), { name: 'Research' });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
  assert.match(response.headers.get('set-cookie'), /studio\.session=next/);
  assert.deepEqual(await response.json(), { title: 'Missing', status: 404 });
});

test('accepts only primary Cloudflare client addresses and replaces spoofable forwarding headers', async () => {
  const seen = [];
  const router = ingress(async (request) => {
    seen.push(request);
    return new Response(null, { status: 204 });
  });
  await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/api/status`, {
      headers: {
        'cf-connecting-ip': '192.0.2.8',
        'cf-connecting-ipv6': '2001:db8::7',
        'x-forwarded-for': '198.51.100.1, 198.51.100.2',
        'x-real-ip': '198.51.100.3',
        'x-studio-managed-ingress-proof': 'attacker-controlled',
      },
    }),
  );
  assert.equal(seen[0].headers.get('x-forwarded-for'), '192.0.2.8');
  assert.equal(seen[0].headers.get('cf-connecting-ip'), null);
  assert.equal(seen[0].headers.get('cf-connecting-ipv6'), null);
  assert.equal(seen[0].headers.get('x-real-ip'), null);
  assert.equal(
    seen[0].headers.get('x-studio-managed-ingress-proof'),
    INGRESS_SECRET,
  );

  await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/api/status`, {
      headers: {
        'cf-connecting-ip': '2001:DB8::8',
        'cf-connecting-ipv6': 'attacker-controlled',
      },
    }),
  );
  assert.equal(seen[1].headers.get('x-forwarded-for'), '2001:db8::8');

  for (const edgeClientIp of [
    false,
    '999.1.1.1',
    '01.2.3.4',
    '1.2.3.4, 5.6.7.8',
    '2001:db8::g',
    '[2001:db8::1]',
    'client.example',
  ]) {
    const refused = await ingress(
      async () => {
        throw new Error('invalid address reached origin');
      },
      { edgeClientIp },
    ).fetch(new Request(`${PUBLIC_ORIGIN}/api/status`));
    assert.equal(refused.status, 400);
  }
});

test('refuses to route when the backend ingress proof is absent or malformed', async () => {
  for (const backendIngressSecret of [undefined, 'too-short', 'a'.repeat(31)]) {
    const router = createManagedStudioIngress({
      publicOrigin: PUBLIC_ORIGIN,
      staticOrigin: STATIC_ORIGIN,
      backendOrigin: BACKEND_ORIGIN,
      backendIngressSecret,
      fetchImpl: async () => {
        throw new Error('unconfigured ingress reached origin');
      },
    });
    const response = await router.fetch(new Request(`${PUBLIC_ORIGIN}/`));
    assert.equal(response.status, 503);
  }
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

test('preserves caching only for successful immutable content-addressed reads', async () => {
  const hash = 'a'.repeat(64);
  const immutable = 'public, max-age=31536000, immutable';
  const router = ingress(
    async () =>
      new Response('asset bytes', {
        headers: {
          'cache-control': immutable,
          'content-type': 'image/png',
          'etag': `"${hash}"`,
        },
      }),
  );

  for (const method of ['GET', 'HEAD']) {
    const response = await router.fetch(
      new Request(`${PUBLIC_ORIGIN}/storage/${hash}`, { method }),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), immutable);
    assert.equal(
      response.headers.get('cloudflare-cdn-cache-control'),
      immutable,
    );
    assert.equal(response.headers.get('cdn-cache-control'), immutable);
    assert.equal(response.headers.get('etag'), `"${hash}"`);
  }
});

test('admits a proved immutable GET to Cache API and serves its canonical cache entry', async () => {
  const hash = '9'.repeat(64);
  const immutable = 'public, max-age=31536000, immutable';
  const entries = new Map();
  const matchRequests = [];
  const putRequests = [];
  const cache = {
    async match(request) {
      matchRequests.push(request);
      return entries.get(request.url)?.clone();
    },
    async put(request, response) {
      putRequests.push(request);
      entries.set(request.url, response.clone());
    },
  };
  const tasks = [];
  let originCalls = 0;
  const router = ingress(
    async () => {
      originCalls += 1;
      return new Response('immutable bytes', {
        headers: {
          'cache-control': immutable,
          'content-type': 'application/octet-stream',
          'etag': `"${hash}"`,
        },
      });
    },
    { cache, waitUntil: (task) => tasks.push(task) },
  );
  const browserRequest = new Request(
    `${PUBLIC_ORIGIN}/storage/${hash}?private=query`,
    {
      headers: {
        authorization: 'Bearer secret',
        cookie: 'studio.session=secret',
      },
    },
  );
  const first = await router.fetch(browserRequest);
  assert.equal(await first.text(), 'immutable bytes');
  await Promise.all(tasks);
  const second = await router.fetch(browserRequest);
  assert.equal(await second.text(), 'immutable bytes');
  assert.equal(originCalls, 1);
  assert.equal(putRequests.length, 1);
  assert.equal(putRequests[0].url, `${PUBLIC_ORIGIN}/storage/${hash}`);
  assert.deepEqual([...putRequests[0].headers], []);
  assert.equal(matchRequests[0].url, `${PUBLIC_ORIGIN}/storage/${hash}`);
  assert.equal(matchRequests[0].headers.get('authorization'), null);
  assert.equal(matchRequests[0].headers.get('cookie'), null);
});

test('uses only safe Cache API variants and never populates a bodyless HEAD entry', async () => {
  const hash = '8'.repeat(64);
  const immutable = 'public, max-age=31536000, immutable';
  let cached;
  let puts = 0;
  let origins = 0;
  const cache = {
    async match(request) {
      if (cached.status === 206)
        assert.equal(request.headers.get('range'), 'bytes=0-3');
      if (cached.status === 304)
        assert.equal(request.headers.get('if-none-match'), `"${hash}"`);
      return cached;
    },
    async put() {
      puts += 1;
    },
  };
  cached = new Response('part', {
    status: 206,
    headers: {
      'cache-control': immutable,
      'content-range': 'bytes 0-3/12',
      'etag': `"${hash}"`,
    },
  });
  const router = ingress(
    async () => {
      origins += 1;
      return new Response(null, {
        headers: { 'cache-control': immutable, 'etag': `"${hash}"` },
      });
    },
    { cache, waitUntil: () => {} },
  );
  const ranged = await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/storage/${hash}`, {
      headers: { range: 'bytes=0-3' },
    }),
  );
  assert.equal(ranged.status, 206);
  assert.equal(await ranged.text(), 'part');
  assert.equal(origins, 0);

  cached = new Response(null, {
    status: 304,
    headers: { 'cache-control': immutable, 'etag': `"${hash}"` },
  });
  const conditional = await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/storage/${hash}`, {
      headers: { 'if-none-match': `"${hash}"` },
    }),
  );
  assert.equal(conditional.status, 304);
  assert.equal(origins, 0);

  const headRouter = ingress(
    async () =>
      new Response(null, {
        headers: { 'cache-control': immutable, 'etag': `"${hash}"` },
      }),
    { cache: { put: async () => (puts += 1) }, waitUntil: () => {} },
  );
  const head = await headRouter.fetch(
    new Request(`${PUBLIC_ORIGIN}/storage/${hash}`, { method: 'HEAD' }),
  );
  assert.equal(head.status, 200);
  assert.equal(puts, 0);
});

test('bypasses Cache API for If-Range so the origin decides full or partial semantics', async () => {
  const hash = '9'.repeat(64);
  let cacheCalls = 0;
  let originCalls = 0;
  const router = ingress(
    async (request) => {
      originCalls += 1;
      assert.equal(request.headers.get('range'), 'bytes=0-3');
      assert.equal(request.headers.get('if-range'), '"wrong-validator"');
      return new Response('complete immutable bytes', {
        status: 200,
        headers: {
          'cache-control': 'public, max-age=31536000, immutable',
          'etag': `"${hash}"`,
        },
      });
    },
    {
      cache: {
        match: async () => {
          cacheCalls += 1;
          return new Response('incorrect cached part', { status: 206 });
        },
      },
    },
  );
  const response = await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/storage/${hash}`, {
      headers: { 'range': 'bytes=0-3', 'if-range': '"wrong-validator"' },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'complete immutable bytes');
  assert.equal(cacheCalls, 0);
  assert.equal(originCalls, 1);
});

test('cache failures and unsafe cache entries preserve the streamed origin response', async () => {
  const hash = '7'.repeat(64);
  const immutable = 'public, max-age=31536000, immutable';
  let originCalls = 0;
  const tasks = [];
  const router = ingress(
    async () => {
      originCalls += 1;
      return new Response('origin bytes', {
        headers: { 'cache-control': immutable, 'etag': `"${hash}"` },
      });
    },
    {
      cache: {
        match: async () =>
          new Response('poison', {
            headers: {
              'cache-control': immutable,
              'etag': `"${'6'.repeat(64)}"`,
            },
          }),
        put: async () => {
          throw new Error('cache write failed');
        },
      },
      waitUntil: (task) => tasks.push(task),
    },
  );
  const response = await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/storage/${hash}`),
  );
  assert.equal(await response.text(), 'origin bytes');
  await Promise.all(tasks);
  assert.equal(originCalls, 1);

  const contextFailure = ingress(
    async () =>
      new Response('still streamed', {
        headers: { 'cache-control': immutable, 'etag': `"${hash}"` },
      }),
    {
      cache: { put: async () => {} },
      waitUntil: () => {
        throw new Error('execution context rejected task');
      },
    },
  );
  const preserved = await contextFailure.fetch(
    new Request(`${PUBLIC_ORIGIN}/storage/${hash}`),
  );
  assert.equal(await preserved.text(), 'still streamed');
});

test('never consults or populates Cache API for dynamic backend responses', async () => {
  let cacheCalls = 0;
  const router = ingress(
    async () =>
      Response.json(
        { user: 'private' },
        { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
      ),
    {
      cache: {
        match: async () => {
          cacheCalls += 1;
        },
        put: async () => {
          cacheCalls += 1;
        },
      },
      waitUntil: () => {},
    },
  );
  const response = await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/api/auth/get-session`, {
      headers: { cookie: 'studio.session=private' },
    }),
  );
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(cacheCalls, 0);
});

test('refuses backend caching when any immutable asset proof is absent', async () => {
  const hash = 'b'.repeat(64);
  const immutable = 'public, max-age=31536000, immutable';
  const cases = [
    {
      path: `/storage/${hash}`,
      status: 404,
      cache: immutable,
      etag: `"${hash}"`,
    },
    {
      path: '/storage/not-a-hash',
      status: 200,
      cache: immutable,
      etag: '"not-a-hash"',
    },
    {
      path: `/storage/${hash}/extra`,
      status: 200,
      cache: immutable,
      etag: `"${hash}"`,
    },
    {
      path: `/storage/${hash}`,
      status: 200,
      cache: 'public, max-age=60',
      etag: `"${hash}"`,
    },
    {
      path: `/storage/${hash}`,
      status: 200,
      cache: immutable,
      etag: `"${'c'.repeat(64)}"`,
    },
    {
      path: `/storage/${hash}`,
      status: 200,
      cache: immutable,
      etag: `"${hash}"`,
      cookie: true,
    },
    {
      method: 'POST',
      path: `/storage/${hash}`,
      status: 200,
      cache: immutable,
      etag: `"${hash}"`,
    },
  ];

  for (const candidate of cases) {
    const router = ingress(
      async () =>
        new Response(candidate.status === 404 ? 'missing' : 'candidate', {
          status: candidate.status,
          headers: {
            'cache-control': candidate.cache,
            'etag': candidate.etag,
            ...(candidate.cookie
              ? { 'set-cookie': 'studio.session=unsafe' }
              : {}),
          },
        }),
    );
    const response = await router.fetch(
      new Request(`${PUBLIC_ORIGIN}${candidate.path}`, {
        method: candidate.method ?? 'GET',
      }),
    );
    assert.equal(
      response.headers.get('cache-control'),
      'no-store',
      candidate.path,
    );
    assert.equal(
      response.headers.get('cloudflare-cdn-cache-control'),
      'no-store',
      candidate.path,
    );
    assert.equal(
      response.headers.get('cdn-cache-control'),
      'no-store',
      candidate.path,
    );
  }
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

test('gives the bounded 100 MiB upload path its upload-appropriate deadline', async () => {
  const chunk = new Uint8Array(1024 * 1024);
  let chunks = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (chunks === 100) {
        controller.close();
        return;
      }
      chunks += 1;
      controller.enqueue(chunk);
    },
  });
  const router = ingress(
    async (request) => {
      const reader = request.body.getReader();
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
      }
      assert.equal(bytes, 100 * 1024 * 1024);
      await new Promise((resolve) => setTimeout(resolve, 40));
      return new Response(JSON.stringify({ size: bytes }), { status: 201 });
    },
    { originTimeoutMs: 20, uploadOriginTimeoutMs: 200 },
  );

  const response = await router.fetch(
    new Request(`${PUBLIC_ORIGIN}/storage`, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/octet-stream' },
      duplex: 'half',
    }),
  );
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { size: 100 * 1024 * 1024 });
});

test('keeps stalled uploads bounded and does not broaden the upload deadline', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const router = ingress(() => new Promise(() => {}), {
    originTimeoutMs: 20,
    uploadOriginTimeoutMs: 60,
  });
  let uploadSettled = false;
  const pendingUpload = router
    .fetch(
      new Request(`${PUBLIC_ORIGIN}/storage`, {
        method: 'POST',
        body: 'stalled',
      }),
    )
    .then((response) => {
      uploadSettled = true;
      return response;
    });
  await new Promise((resolve) => setImmediate(resolve));
  context.mock.timers.tick(59);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(uploadSettled, false);
  context.mock.timers.tick(1);
  const upload = await pendingUpload;
  assert.equal(upload.status, 504);

  let nonUploadSettled = false;
  const pendingNonUpload = router
    .fetch(
      new Request(`${PUBLIC_ORIGIN}/storage/${'d'.repeat(64)}`, {
        method: 'POST',
        body: 'not an upload route',
      }),
    )
    .then((response) => {
      nonUploadSettled = true;
      return response;
    });
  await new Promise((resolve) => setImmediate(resolve));
  context.mock.timers.tick(19);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(nonUploadSettled, false);
  context.mock.timers.tick(1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(nonUploadSettled, true);
  const nonUpload = await pendingNonUpload;
  assert.equal(nonUpload.status, 504);
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
