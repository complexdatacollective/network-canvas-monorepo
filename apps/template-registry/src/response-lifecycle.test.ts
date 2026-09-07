import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';

import { afterEach, expect, it, vi } from 'vitest';

import { retainResponseTransport } from './response-lifecycle.ts';

async function fixture(timeoutMs?: number) {
  const release = vi.fn();
  const entered = Promise.withResolvers<{
    response: ServerResponse;
    handlerCompleted: () => void;
  }>();
  const server = createServer((_request, response) => {
    const handlerCompleted = retainResponseTransport(
      response,
      release,
      timeoutMs,
    );
    response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    response.flushHeaders();
    entered.resolve({ response, handlerCompleted });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('REGISTRY_TEST_HTTP_ADDRESS_MISSING');
  return {
    release,
    entered: entered.promise,
    url: `http://127.0.0.1:${address.port}/`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

it('keeps capacity after handler completion until the Node response finishes', async () => {
  const peer = await fixture();
  try {
    const pending = fetch(peer.url);
    const { response, handlerCompleted } = await peer.entered;
    const result = await pending;
    handlerCompleted();
    handlerCompleted();
    expect(peer.release).not.toHaveBeenCalled();
    const finished = once(response, 'finish');
    response.end('Artifact bytes');
    await finished;
    expect(await result.text()).toBe('Artifact bytes');
    expect(peer.release).toHaveBeenCalledTimes(1);
  } finally {
    await peer.close();
  }
});

it('keeps capacity after disconnect until an in-flight handler completes', async () => {
  const peer = await fixture();
  try {
    const pending = fetch(peer.url);
    const { response, handlerCompleted } = await peer.entered;
    const result = await pending;
    const closed = once(response, 'close');
    await result.body?.cancel();
    await closed;
    expect(peer.release).not.toHaveBeenCalled();
    handlerCompleted();
    handlerCompleted();
    expect(peer.release).toHaveBeenCalledTimes(1);
  } finally {
    await peer.close();
  }
});

it('destroys a live response at the absolute deadline even after its handler completed', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const peer = await fixture(1000);
  try {
    const pending = fetch(peer.url);
    const { response, handlerCompleted } = await peer.entered;
    const result = await pending;
    handlerCompleted();
    expect(peer.release).not.toHaveBeenCalled();
    const closed = once(response, 'close');
    const body = result.text().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1000);
    expect(response.destroyed).toBe(true);
    await closed;
    expect(await body).toBeInstanceOf(Error);
    expect(peer.release).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
    await peer.close();
  }
});
