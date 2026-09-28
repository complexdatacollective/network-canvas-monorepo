import { createServer, type Socket } from 'node:net';

import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { readiness } from '../../http/health.ts';
import { ObjectStore } from '../object-store.ts';

// The readiness probe's bound has to reach the SDK, not only the wait: the
// route can stop waiting on its own, but the request would carry on retrying
// and holding a socket — once per probe, every few seconds, for as long as the
// endpoint is unreachable. So what is observed here is the socket, from the
// far end: an endpoint that accepts the connection and never answers, which
// the SDK would otherwise wait on indefinitely.

/** A TCP listener that answers nothing, and the sockets it has seen close. */
const silentEndpoint = Effect.acquireRelease(
  Effect.callback<{
    readonly port: number;
    readonly accepted: () => number;
    readonly closed: () => number;
    readonly close: () => void;
  }>((resume) => {
    const sockets = new Set<Socket>();
    let accepted = 0;
    let closed = 0;
    const server = createServer((socket) => {
      accepted += 1;
      sockets.add(socket);
      // Read and discard what the SDK sends, or the far end's close would
      // queue behind unread bytes and never be seen here.
      socket.resume();
      socket.on('close', () => {
        closed += 1;
        sockets.delete(socket);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        resume(Effect.die(new Error('no TCP address')));
        return;
      }
      resume(
        Effect.succeed({
          port: address.port,
          accepted: () => accepted,
          closed: () => closed,
          close: () => {
            for (const socket of sockets) socket.destroy();
            server.close();
          },
        }),
      );
    });
  }),
  (endpoint) => Effect.sync(() => endpoint.close()),
);

describe('the object store', () => {
  it.live(
    'ends a readiness probe it stopped waiting on, rather than only giving up on it',
    () =>
      Effect.gen(function* () {
        const endpoint = yield* silentEndpoint;
        const store = ObjectStore.make({
          endpoint: `http://127.0.0.1:${endpoint.port}`,
          region: 'us-east-1',
          bucket: 'studio-test',
          accessKeyId: 'key',
          secretAccessKey: 'secret',
        });

        const result = yield* readiness({
          objectStore: Effect.as(store.head, 'ok' as const),
        });
        expect(result.checks.objectStore).toBe(
          'failed: timed out after 1000ms',
        );
        expect(endpoint.accepted()).toBe(1);

        // The abort lands asynchronously once the fiber is interrupted; a
        // request left running would hold its socket open indefinitely.
        // Mutation: drop `abortSignal` from `head`'s send → this stays 0.
        yield* Effect.gen(function* () {
          while (endpoint.closed() === 0) yield* Effect.sleep('10 millis');
        }).pipe(
          Effect.timeoutOrElse({
            duration: '2 seconds',
            orElse: () => Effect.void,
          }),
        );
        expect(endpoint.closed()).toBe(1);
      }).pipe(Effect.scoped),
    10_000,
  );
});
