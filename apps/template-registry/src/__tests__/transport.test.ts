import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';
import { createConnection, type Socket } from 'node:net';

import { getRequestListener } from '@hono/node-server';
import { expect, it, vi } from 'vitest';

import { CURRENT_SCHEMA_VERSION } from '@codaco/protocol-validation';
import { REQUEST_ID } from '@codaco/studio-sync/operational-http';

import { createRegistryApp } from '../app.ts';
import { createRegistryFixture, ORIGIN, template } from './fixtures.ts';

const PRIVACY_CANARY =
  'participant@example.test-secret-token-template-id-0123456789';
const SUPPLIED_REQUEST_ID = 'CB6DC2C0-DF78-4FD2-9131-7FF2909C88E5';

it('retains artifact capacity while actual Node responses are blocked on a paused TCP reader', async () => {
  const fixture = await createRegistryFixture({
    publisherBytes: 10 * 1024 * 1024,
    totalBytes: 20 * 1024 * 1024,
  });
  const sockets: Socket[] = [];
  const responses: ServerResponse[] = [];
  const server = createServer((incoming, outgoing) => {
    responses.push(outgoing);
    void getRequestListener(fixture.app.fetch, {
      overrideGlobalObjects: false,
    })(incoming, outgoing);
  });
  try {
    const account = await fixture.account();
    // Media intake screens the actual byte signature. Random trailing bytes
    // make this transport fixture incompressible; decoding is not the test.
    const image = randomBytes(6 * 1024 * 1024);
    image.set(
      Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108000000003a7e9b55' +
          '0000000a4944415408d76360000000020001e221bc330000000049454e44ae426082',
        'hex',
      ),
    );
    const created = await fixture.published(
      account.token,
      'Large transport fixture',
      {
        sections: {
          'settings': {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            name: 'Large transport fixture',
          },
          'stageOrder': { stages: ['welcome'] },
          'stage:welcome': {
            id: 'welcome',
            type: 'Information',
            label: 'Welcome',
            title: 'Welcome',
            items: [{ id: 'picture', type: 'asset', content: 'picture' }],
          },
          'assets': {
            picture: { type: 'image', name: 'Picture', source: 'picture.png' },
          },
        },
        assets: [
          {
            source: 'picture.png',
            media_type: 'image/png',
            media_class: 'image',
            bytes: image,
          },
        ],
      },
    );
    expect(created.bytes.byteLength).toBeGreaterThan(5 * 1024 * 1024);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const bound = server.address();
    if (!bound || typeof bound === 'string')
      throw new Error('REGISTRY_TEST_HTTP_ADDRESS_MISSING');
    const path = `/api/v1/artifacts/${created.entry.root}`;
    for (let index = 0; index < 2; index++) {
      const socket = createConnection({ host: '127.0.0.1', port: bound.port });
      sockets.push(socket);
      socket.on('error', () => undefined);
      await once(socket, 'connect');
      socket.pause();
      socket.write(
        `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${bound.port}\r\nConnection: close\r\n\r\n`,
      );
    }
    await vi.waitFor(
      () => {
        expect(fixture.blobs.get).toHaveBeenCalledTimes(2);
        expect(responses).toHaveLength(2);
        for (const response of responses) {
          expect(response.headersSent).toBe(true);
          expect(response.writableFinished).toBe(false);
          expect(response.writableLength).toBeGreaterThan(0);
        }
      },
      { timeout: 5000, interval: 10 },
    );
    const blocked = await fetch(`http://127.0.0.1:${bound.port}${path}`);
    const blockedStatus = blocked.status;
    await blocked.body?.cancel();
    expect(blockedStatus).toBe(503);
    expect(fixture.blobs.get).toHaveBeenCalledTimes(2);
    sockets[0]!.destroy();
    await vi.waitFor(() => expect(responses[0]!.destroyed).toBe(true));
    await vi.waitFor(() =>
      expect(
        fixture.requestLogs.filter(({ status }) => status === 499),
      ).toHaveLength(1),
    );
    const recovered = await fetch(`http://127.0.0.1:${bound.port}${path}`);
    expect(recovered.status).toBe(200);
    expect(new Uint8Array(await recovered.arrayBuffer())).toEqual(
      created.bytes,
    );
    expect(fixture.blobs.get).toHaveBeenCalledTimes(3);
  } finally {
    for (const socket of sockets) socket.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fixture.dispose();
  }
});

it.each(['auth', 'json', 'multipart'] as const)(
  'accepts %s POST bodies through the actual Node request adapter',
  async (kind) => {
    const fixture = await createRegistryFixture();
    const server = createServer(
      getRequestListener(fixture.app.fetch, { overrideGlobalObjects: false }),
    );
    try {
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const bound = server.address();
      if (!bound || typeof bound === 'string')
        throw new Error('REGISTRY_TEST_HTTP_ADDRESS_MISSING');
      const origin = `http://127.0.0.1:${bound.port}`;
      if (kind === 'auth') {
        const response = await fetch(`${origin}/api/auth/sign-in/magic-link`, {
          method: 'POST',
          headers: { 'origin': ORIGIN, 'content-type': 'application/json' },
          body: JSON.stringify({
            email: 'transport@example.test',
            callbackURL: '/account',
          }),
        });
        expect(response.status).toBe(200);
        expect(fixture.sent).toHaveLength(1);
        expect(fixture.sent[0]?.email).toBe('transport@example.test');
      } else if (kind === 'json') {
        const account = await fixture.login('transport@example.test');
        const headers = new Headers(account.headers);
        headers.set('content-type', 'application/json');
        const response = await fetch(`${origin}/api/v1/account/publisher`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: 'Transport publisher' }),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          name: 'Transport publisher',
        });
      } else {
        const account = await fixture.account();
        const artifact = await template();
        const form = new FormData();
        form.set(
          'artifact',
          new File([artifact.bytes], 'transport.nctemplate'),
        );
        const response = await fetch(`${origin}/api/v1/entries`, {
          method: 'POST',
          headers: account.bearer,
          body: form,
        });
        expect(response.status).toBe(201);
        expect(fixture.blobs.put).toHaveBeenCalledTimes(1);
        expect(await response.json()).toMatchObject({
          template: { name: 'Portable template' },
        });
      }
      expect(fixture.diagnostics).not.toContain('REGISTRY_REQUEST_FAILED');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await fixture.dispose();
    }
  },
);

it('logs one bounded line at actual Node completion and exports bounded metrics', async () => {
  const fixture = await createRegistryFixture();
  const server = createServer(
    getRequestListener(fixture.app.fetch, { overrideGlobalObjects: false }),
  );
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const bound = server.address();
    if (!bound || typeof bound === 'string')
      throw new Error('REGISTRY_TEST_HTTP_ADDRESS_MISSING');
    const response = await fetch(
      `http://127.0.0.1:${bound.port}/api/${PRIVACY_CANARY}?token=${PRIVACY_CANARY}`,
      {
        headers: {
          'x-request-id': SUPPLIED_REQUEST_ID,
          'cookie': PRIVACY_CANARY,
        },
      },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('x-request-id')).toMatch(REQUEST_ID);
    expect(response.headers.get('x-request-id')).not.toBe(
      SUPPLIED_REQUEST_ID.toLowerCase(),
    );
    await response.text();
    await vi.waitFor(() => expect(fixture.requestLogs).toHaveLength(1));
    expect(fixture.requestLogs[0]).toEqual({
      timestamp: expect.any(String),
      event: 'http_request',
      request_id: response.headers.get('x-request-id'),
      route: 'unmatched',
      method: 'GET',
      status: 404,
      duration_ms: expect.any(Number),
    });
    expect(JSON.stringify(fixture.requestLogs)).not.toContain(PRIVACY_CANARY);
    const metrics = await fixture.observability.scrape();
    expect(metrics.body).toContain(
      'registry_http_requests_total{method="GET",route="unmatched",status="404"} 1',
    );
    expect(metrics.body).not.toContain(PRIVACY_CANARY);
    expect(metrics.body).toContain(
      'registry_database_pool_capacity{pool="application"}',
    );
    expect(metrics.body).toContain(
      'registry_database_pool_capacity{pool="operator"}',
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fixture.dispose();
  }
});

it('accepts a supplied request UUID only from an explicitly trusted transport peer', async () => {
  const fixture = await createRegistryFixture();
  const app = createRegistryApp({
    ...fixture,
    trustedProxies: ['127.0.0.1'],
    accepting: () => true,
    ready: async () => true,
    onDiagnostic: () => {
      throw new Error('Unexpected diagnostic');
    },
  });
  expect(
    (
      await app.request(`${ORIGIN}/healthz`, {
        headers: { 'x-request-id': SUPPLIED_REQUEST_ID },
      })
    ).headers.get('x-request-id'),
  ).not.toBe(SUPPLIED_REQUEST_ID.toLowerCase());
  const server = createServer(
    getRequestListener(app.fetch, { overrideGlobalObjects: false }),
  );
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const bound = server.address();
    if (!bound || typeof bound === 'string')
      throw new Error('REGISTRY_TEST_HTTP_ADDRESS_MISSING');
    const response = await fetch(`http://127.0.0.1:${bound.port}/healthz`, {
      headers: { 'x-request-id': SUPPLIED_REQUEST_ID },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe(
      SUPPLIED_REQUEST_ID.toLowerCase(),
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fixture.dispose();
  }
});

it('keeps metrics outside Better Auth and requires its optional dedicated token', async () => {
  const fixture = await createRegistryFixture();
  const token = 'registry-metrics-token-at-least-32-characters';
  try {
    expect((await fixture.app.request(`${ORIGIN}/metrics`)).status).toBe(404);
    const app = createRegistryApp({
      ...fixture,
      metricsToken: token,
      accepting: () => true,
      ready: async () => true,
      onDiagnostic: () => {
        throw new Error('Unexpected diagnostic');
      },
    });
    for (const authorization of [
      undefined,
      'Basic wrong',
      'Bearer wrong',
      `Bearer ${token} extra`,
    ]) {
      const response = await app.request(`${ORIGIN}/metrics`, {
        headers: authorization ? { authorization } : undefined,
      });
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe('Bearer');
      expect(await response.text()).not.toContain(token);
    }
    const response = await app.request(`${ORIGIN}/metrics`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toContain('registry_http_requests_total');
    expect(
      (
        await app.request(`${ORIGIN}/api/auth/metrics`, {
          headers: { authorization: `Bearer ${token}` },
        })
      ).status,
    ).not.toBe(200);
    expect(JSON.stringify(fixture.requestLogs)).not.toContain(token);
  } finally {
    await fixture.dispose();
  }
});
