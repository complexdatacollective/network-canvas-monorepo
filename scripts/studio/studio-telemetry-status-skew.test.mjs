import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { test } from 'vitest';

import { installStatusVersionSkew } from '../../apps/studio/client/scripts/telemetry-egress.mjs';

const origin = 'http://127.0.0.1:45971';

test('keeps Studio loopback requests in the browser network namespace', async () => {
  const source = await readFile(
    new URL(
      '../../apps/studio/client/scripts/telemetry-egress.mjs',
      import.meta.url,
    ),
    'utf8',
  );
  assert(!source.includes('route.fetch('));
});

test('skews only a successful same-origin status envelope after the real fetch', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const envelope = {
    json: {
      telemetry: true,
      deployment: { mode: 'managed', billing: false },
      version: '0.4.0',
    },
    meta: { requestId: 'real-response' },
  };
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return new Response(JSON.stringify(envelope), {
      status: 200,
      statusText: 'Studio OK',
      headers: {
        'content-length': '999',
        'content-type': 'application/json',
        'x-studio-proof': 'real-network',
      },
    });
  };
  try {
    installStatusVersionSkew({ origin, version: '99.98.97' });
    const init = { method: 'POST', headers: { 'x-client': 'qualification' } };
    const response = await fetch('/rpc/status', init);

    assert.deepEqual(calls, [['/rpc/status', init]]);
    assert.equal(response.status, 200);
    assert.equal(response.statusText, 'Studio OK');
    assert.equal(response.headers.get('x-studio-proof'), 'real-network');
    const body = await response.json();
    assert.deepEqual(body, {
      ...envelope,
      json: { ...envelope.json, version: '99.98.97' },
    });
    assert.equal(
      response.headers.get('content-length'),
      String(new TextEncoder().encode(JSON.stringify(body)).length),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('leaves every other response untouched', async () => {
  const originalFetch = globalThis.fetch;
  const asset = new Response('asset');
  const external = new Response('external');
  const unavailable = new Response('unavailable', { status: 503 });
  const responses = [asset, external, unavailable];
  globalThis.fetch = async () => responses.shift();
  try {
    installStatusVersionSkew({ origin, version: '99.98.97' });
    assert.equal(await fetch('/assets/app.js'), asset);
    assert.equal(await fetch('https://example.test/rpc/status'), external);
    assert.equal(await fetch('/rpc/status'), unavailable);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fails closed when the successful status envelope changes shape', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ json: { release: '0.4.0' } }), {
      headers: { 'content-type': 'application/json' },
    });
  try {
    installStatusVersionSkew({ origin, version: '99.98.97' });
    await assert.rejects(
      fetch('/rpc/status'),
      /Studio status response envelope changed/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
