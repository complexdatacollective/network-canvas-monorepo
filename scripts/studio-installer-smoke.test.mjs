import assert from 'node:assert/strict';
import test from 'node:test';

import { smoke } from '../apps/studio/deployment/installer/smoke.mjs';

function fixture(failure) {
  const calls = [];
  const credentials = {
    email: 'synthetic@example.test',
    password: 'SYNTHETIC_PRIVATE_PASSWORD',
  };
  const input = {
    mode: 'update',
    origin: 'https://studio.example.test',
    credentials,
  };
  const request = async (url, options) => {
    calls.push({ url, options });
    assert.equal(new URL(url).origin, 'http://127.0.0.1:3000');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.origin, input.origin);
    switch (new URL(url).pathname) {
      case '/readyz':
        return Response.json({
          status: failure === 'readiness' ? 'unready' : 'ready',
        });
      case '/':
        return new Response('<html>Selected shell</html>', {
          headers: {
            'content-type': failure === 'shell' ? 'text/plain' : 'text/html',
          },
        });
      case '/setup':
        return new Response('', {
          status: failure === 'setup' || input.mode === 'fresh' ? 200 : 404,
        });
      case '/api/auth/sign-in/email':
        return Response.json(
          {},
          {
            status: failure === 'signin' ? 401 : 200,
            headers:
              failure === 'cookie'
                ? {}
                : { 'set-cookie': 'session=synthetic; Secure; HttpOnly' },
          },
        );
      case '/api/auth/get-session':
        return Response.json({
          user: {
            id: 'user-1',
            email:
              failure === 'session'
                ? 'someone-else@example.test'
                : credentials.email,
          },
        });
      case '/rpc/me':
        return Response.json({
          json: {
            userId: failure === 'rpc' ? 'wrong-user' : 'user-1',
            teams: [],
          },
        });
      case '/api/auth/sign-out':
        return Response.json({}, { status: failure === 'signout' ? 500 : 200 });
      default:
        throw new Error('Unexpected private smoke path');
    }
  };
  return { calls, input, request };
}

test('the private upgrade smoke validates readiness, permanent setup closure, authentication and the authorized RPC and closes its session', async () => {
  const f = fixture();
  assert.deepEqual(await smoke(f.input, f.request), {
    ready: true,
    setup: 'completed',
    authenticated: true,
  });
  assert.equal(f.calls.at(-1).url, 'http://127.0.0.1:3000/api/auth/sign-out');
});

for (const failure of [
  'readiness',
  'shell',
  'setup',
  'signin',
  'cookie',
  'session',
  'rpc',
  'signout',
])
  test(`the private smoke refuses ${failure} failure instead of blessing an HTTP200 shell or wrong account`, async () => {
    const f = fixture(failure);
    await assert.rejects(smoke(f.input, f.request));
    if (['readiness', 'shell', 'setup'].includes(failure))
      assert.equal(
        f.calls.some(({ url }) => url.includes('/api/auth/')),
        false,
      );
    if (['session', 'rpc', 'signout'].includes(failure))
      assert.ok(f.calls.at(-1).url.endsWith('/sign-out'));
  });

test('fresh-install smoke requires first-run setup and never creates a first owner or sends credentials', async () => {
  const f = fixture();
  f.input.mode = 'fresh';
  assert.deepEqual(await smoke(f.input, f.request), {
    ready: true,
    setup: 'ready',
    authenticated: false,
  });
  assert.equal(f.calls.length, 3);
  assert.equal(
    f.calls.some(({ options }) => options.body),
    false,
  );
});
