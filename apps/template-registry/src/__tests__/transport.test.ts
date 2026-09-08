import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';
import { createConnection, type Socket } from 'node:net';

import { getRequestListener } from '@hono/node-server';
import { expect, it, vi } from 'vitest';

import { CURRENT_SCHEMA_VERSION } from '@codaco/protocol-validation';

import { createRegistryFixture, ORIGIN, template } from './fixtures.ts';

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
