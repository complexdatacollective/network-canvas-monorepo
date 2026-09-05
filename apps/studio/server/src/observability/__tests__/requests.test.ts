import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { serve } from '@hono/node-server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';

import { stubAuthService } from '../../__tests__/support/auth.ts';
import { createApp } from '../../app.ts';
import { mountClient } from '../../client-assets.ts';
import { readEnv } from '../../env.ts';
import { createOperationalLogger, operationalLogger, UUID } from '../logger.ts';
import { isProxyAddress, trustedPeer } from '../proxy.ts';
import { observeWebSocketServer } from '../requests.ts';
import { createObservability } from '../runtime.ts';

const CANARY = 'participant@example.test-Secret-Answer-Protocol-Token';
const token = 'operator-metrics-token-at-least-32-characters';
const principal = {
  kind: 'user' as const,
  userId: CANARY,
  sessionId: CANARY,
  email: CANARY,
  emailVerified: true,
  name: CANARY,
  locale: 'en',
};
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) await cleanup();
  vi.restoreAllMocks();
});

function fixture(proxies: string[] = []) {
  const lines: Record<string, unknown>[] = [];
  const logger = createOperationalLogger({
    write(line) {
      lines.push(JSON.parse(line) as Record<string, unknown>);
    },
  });
  const env = {
    ...readEnv(),
    db: undefined,
    auth: undefined,
    s3: undefined,
    metricsToken: token,
    trustedProxies: proxies,
  };
  const observability = createObservability({
    monitorProcess: true,
    cacheMs: 0,
  });
  cleanups.push(async () => observability.stop());
  const app = createApp(env, {
    logger,
    observability,
    auth: stubAuthService({ getSession: () => Promise.resolve(principal) }),
  });
  return { app, env, lines, observability };
}

async function listen(app: ReturnType<typeof createApp>) {
  const wss = new WebSocketServer({ noServer: true });
  observeWebSocketServer(wss);
  const server = serve({
    fetch: app.fetch,
    port: 0,
    hostname: '127.0.0.1',
    websocket: { server: wss },
  });
  await once(server, 'listening');
  const address = server.address();
  if (typeof address !== 'object' || !address)
    throw new Error('missing bound address');
  cleanups.push(async () => {
    for (const socket of wss.clients) socket.terminate();
    if ('closeAllConnections' in server) server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  return `http://127.0.0.1:${address.port}`;
}

describe('request correlation and transport privacy', () => {
  it.each([
    ['127.0.0.1', ['127.0.0.0/8'], true],
    ['::ffff:127.0.0.1', ['127.0.0.0/8'], true],
    ['2001:db8::123', ['2001:db8::/32'], true],
    ['192.0.2.5', ['127.0.0.0/8'], false],
    [undefined, ['127.0.0.0/8'], false],
  ] as const)(
    'validates transport peer %s against CIDRs',
    (peer, proxies, expected) => {
      expect(trustedPeer(peer, proxies)).toBe(expected);
    },
  );

  it.each([
    '127.1',
    'proxy.example.test',
    '10.0.0.0/33',
    '::1/129',
    '10.0.0.1/24/1',
    '10.0.0.1/secret',
  ])('rejects invalid proxy setting %s', (value) => {
    expect(isProxyAddress(value)).toBe(false);
  });

  it('accepts a valid id only from an actual trusted socket and never header claims', async () => {
    const { app, lines } = fixture(['127.0.0.0/8']);
    const url = await listen(app);
    const id = randomUUID();
    const response = await fetch(`${url}/healthz`, {
      headers: { 'x-request-id': id },
    });
    await response.text();
    expect(response.headers.get('x-request-id')).toBe(id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: 'http_request',
      request_id: id,
      route: '/healthz',
      status: 200,
    });

    const direct = await app.request('/healthz', {
      headers: {
        'x-request-id': id,
        'x-forwarded-for': '127.0.0.1',
        'forwarded': 'for=127.0.0.1',
      },
    });
    expect(direct.headers.get('x-request-id')).toMatch(UUID);
    expect(direct.headers.get('x-request-id')).not.toBe(id);
    const malformed = await fetch(`${url}/healthz`, {
      headers: { 'x-request-id': CANARY },
    });
    await malformed.text();
    expect(malformed.headers.get('x-request-id')).toMatch(UUID);
    expect(JSON.stringify(lines)).not.toContain(CANARY);
  });

  it('ignores trusted-looking forwarded headers from an untrusted transport', async () => {
    const { app, lines } = fixture(['10.0.0.0/8']);
    const url = await listen(app);
    const id = randomUUID();
    const response = await fetch(`${url}/healthz`, {
      headers: {
        'x-request-id': id,
        'x-forwarded-for': '10.0.0.1',
        'x-real-ip': '10.0.0.1',
        'forwarded': 'for=10.0.0.1',
      },
    });
    await response.text();
    expect(response.headers.get('x-request-id')).not.toBe(id);
    expect(lines[0]?.request_id).toBe(response.headers.get('x-request-id'));
  });

  it('writes one bounded line for static, unknown, refused and unexpected-error requests', async () => {
    const { app, env, lines, observability } = fixture();
    const folder = await mkdtemp(join(tmpdir(), 'studio-observability-'));
    cleanups.push(() => rm(folder, { recursive: true, force: true }));
    await writeFile(join(folder, 'index.html'), '<html>test client</html>');
    app.get('/failure', () => {
      throw Object.assign(new Error(CANARY), {
        name: CANARY,
        cause: { protocol: CANARY },
      });
    });
    mountClient(app, { ...env, clientDist: folder });
    const url = await listen(app);
    for (const [path, status] of [
      [`/studies/${CANARY}?token=${CANARY}`, 200],
      [`/api/${CANARY}`, 404],
      ['/rpc/me', 404],
      ['/failure', 500],
    ] as const) {
      const response = await fetch(`${url}${path}`, {
        headers: { 'cookie': CANARY, 'x-team-id': CANARY },
      });
      await response.text();
      expect(response.status).toBe(status);
      expect(response.headers.get('x-request-id')).toMatch(UUID);
    }
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      expect(Object.keys(line).toSorted()).toEqual([
        'duration_ms',
        'event',
        'level',
        'method',
        'request_id',
        'route',
        'status',
        'time',
      ]);
      expect(line.duration_ms).toEqual(expect.any(Number));
    }
    expect(JSON.stringify(lines)).not.toContain(CANARY);
    const metrics = await observability.metrics.scrape();
    expect(metrics.body).not.toContain(CANARY);
    expect(metrics.body).toContain(
      'studio_http_requests_total{method="GET",route="client",status="500"} 1',
    );
  });

  it('counts and correlates actual WebSocket upgrades once, excluding message contents', async () => {
    const { app, lines, observability } = fixture(['127.0.0.0/8']);
    const url = await listen(app);
    const id = randomUUID();
    const ws = new WebSocket(url.replace('http:', 'ws:') + '/ws', {
      headers: { 'x-request-id': id },
    });
    const upgrade = once(ws, 'upgrade');
    await once(ws, 'open');
    const [response] = await upgrade;
    expect(response.headers['x-request-id']).toBe(id);
    const message = once(ws, 'message');
    ws.send(CANARY);
    expect(String((await message)[0])).toBe(CANARY);
    expect((await observability.metrics.scrape()).body).toContain(
      'studio_websocket_connections 1',
    );
    ws.close();
    await once(ws, 'close');
    await vi.waitFor(async () =>
      expect((await observability.metrics.scrape()).body).toContain(
        'studio_websocket_connections 0',
      ),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      request_id: id,
      status: 101,
      route: '/ws',
    });
    expect(JSON.stringify(lines)).not.toContain(CANARY);
  });

  it('records a malformed WebSocket handshake as 400, preserving its request id', async () => {
    const { app, lines } = fixture(['127.0.0.0/8']);
    const url = await listen(app);
    const id = randomUUID();
    const response = await new Promise<{
      status: number;
      requestId: string | string[] | undefined;
    }>((resolve, reject) => {
      const req = request(
        `${url}/ws`,
        {
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Version': '13',
            'Sec-WebSocket-Key': CANARY,
            'X-Request-Id': id,
          },
        },
        (res) => {
          res.resume();
          res.once('end', () =>
            resolve({
              status: res.statusCode!,
              requestId: res.headers['x-request-id'],
            }),
          );
        },
      );
      req.once('error', reject);
      req.end();
    });
    expect(response).toEqual({ status: 400, requestId: id });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ status: 400, request_id: id });
  });

  it('refuses metrics without a configured token and without the correct bearer credential', async () => {
    const { app, env, lines } = fixture();
    expect(
      (await createApp({ ...env, metricsToken: undefined }).request('/metrics'))
        .status,
    ).toBe(404);
    for (const authorization of [
      '',
      'Bearer wrong',
      `Basic ${token}`,
      `Bearer ${token} wrong`,
    ]) {
      expect(
        (await app.request('/metrics', { headers: { authorization } })).status,
      ).toBe(401);
    }
    const response = await app.request('/metrics', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toContain(
      'studio_dependency_ready{dependency="database"} 0',
    );
    expect(JSON.stringify(lines)).not.toContain(token);
  });

  it('reports a missing client root safely and serves a later build without a restart', async () => {
    const raw = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const diagnostic = vi
      .spyOn(operationalLogger, 'diagnostic')
      .mockImplementation(() => undefined);
    const { app, env, lines } = fixture();
    const directory = await mkdtemp(join(tmpdir(), 'studio-late-build-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const clientRoot = join(directory, CANARY);
    const uncaughtHandlers = process.listeners('uncaughtException');
    const rejectionHandlers = process.listeners('unhandledRejection');
    mountClient(app, { ...env, clientDist: clientRoot });
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith(
      'STUDIO_CLIENT_ASSETS_UNAVAILABLE',
      undefined,
    );
    expect((await app.request('/studies/new')).status).toBe(404);
    await mkdir(clientRoot);
    await writeFile(
      join(clientRoot, 'index.html'),
      '<html>client built</html>',
    );
    const response = await app.request('/studies/new');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<html>client built</html>');
    expect(lines).toHaveLength(2);
    expect(JSON.stringify(lines)).not.toContain(CANARY);
    expect(raw).not.toHaveBeenCalled();
    expect(process.listeners('uncaughtException')).toEqual(uncaughtHandlers);
    expect(process.listeners('unhandledRejection')).toEqual(rejectionHandlers);
  });

  it.each([false, true])(
    'contains streaming exceptions before the Node adapter can print or return their contents (partial bytes: %s)',
    async (partial) => {
      const diagnostic = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const info = vi
        .spyOn(console, 'info')
        .mockImplementation(() => undefined);
      const { app, lines } = fixture();
      let failStream: (() => void) | undefined;
      app.get(
        '/stream',
        () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                failStream = () => controller.error(new Error(CANARY));
                if (partial)
                  controller.enqueue(new TextEncoder().encode('first bytes'));
                else failStream();
              },
            }),
          ),
      );
      const url = await listen(app);
      if (partial) {
        const response = await fetch(`${url}/stream`);
        const reader = response.body!.getReader();
        expect(await reader.read()).toEqual({
          done: false,
          value: new TextEncoder().encode('first bytes'),
        });
        if (!failStream) throw new Error('stream did not start');
        failStream();
        await expect(reader.read()).rejects.toThrow();
      } else {
        await expect(
          fetch(`${url}/stream`).then((response) => response.text()),
        ).rejects.toThrow();
      }
      await vi.waitFor(() =>
        expect(
          lines.filter((line) => line.event === 'http_request'),
        ).toHaveLength(1),
      );
      expect(lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'STUDIO_RESPONSE_STREAM_FAILED' }),
          expect.objectContaining({ event: 'http_request', status: 500 }),
        ]),
      );
      expect(JSON.stringify(lines)).not.toContain(CANARY);
      expect(diagnostic).not.toHaveBeenCalled();
      expect(info).not.toHaveBeenCalled();
      // Creating/importing an application never rewires process console methods.
      expect(console.error).toBe(diagnostic);
      expect(console.info).toBe(info);
    },
  );
});
