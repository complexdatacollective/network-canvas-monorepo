import { networkInterfaces } from 'node:os';

import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import {
  HttpClient,
  HttpRouter,
  HttpServerResponse,
} from 'effect/unstable/http';

import {
  connectionRefused,
  freePort,
} from '../../__tests__/support/entrypoint.ts';
import { Environment, readEnv } from '../../env.ts';
import { HttpServerLive, WorkerHealthServerLive } from '../http-server.ts';

// A listener is only a listener if something connects to it, so every case
// here goes over a real socket (`it.live`): what the layer binds, that a route
// above it answers, and that closing the scope gives the port back.

const PROBE_BODY = 'listening';

const probeRoute = HttpRouter.add(
  'GET',
  '/probe',
  HttpServerResponse.text(PROBE_BODY),
);

const served = (server: typeof HttpServerLive) =>
  HttpRouter.serve(probeRoute, {
    disableLogger: true,
    disableListenLog: true,
  }).pipe(Layer.provide(server));

/** Every address this machine answers on that is not the loopback. */
function externalAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
}

const environment = (port: number, workerHealthPort: number) =>
  Layer.succeed(Environment, {
    ...readEnv(),
    port,
    workerHealthPort,
    // Deliberately not the loopback: what the worker's health listener binds
    // must not follow this, and what the web listener binds must.
    host: '127.0.0.1',
  });

const probe = (port: number): Effect.Effect<Response> =>
  Effect.promise(() => fetch(`http://127.0.0.1:${port}/probe`));

describe('HttpServerLive', () => {
  // Mutation: read `env.workerHealthPort` instead of `env.port` → the fetch
  // below cannot connect.
  it.live('binds the configured port and answers a route on it', () =>
    Effect.gen(function* () {
      const port = yield* Effect.promise(freePort);
      const other = yield* Effect.promise(freePort);
      const app = served(HttpServerLive).pipe(
        Layer.provide(environment(port, other)),
      );

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* Layer.build(app);
          const response = yield* probe(port);
          expect(response.status).toBe(200);
          expect(yield* Effect.promise(() => response.text())).toBe(PROBE_BODY);
        }),
      );

      // Mutation: drop the scoped close of the Node server → the port is still
      // held here.
      expect(yield* Effect.promise(() => connectionRefused(port))).toBe(true);
    }),
  );
});

describe('WorkerHealthServerLive', () => {
  // Mutation: read `env.port` instead of `env.workerHealthPort` → the health
  // port refuses and the web port answers, inverting both assertions.
  it.live('binds the worker health port rather than the web port', () =>
    Effect.gen(function* () {
      const webPort = yield* Effect.promise(freePort);
      const healthPort = yield* Effect.promise(freePort);
      const app = served(WorkerHealthServerLive).pipe(
        Layer.provide(environment(webPort, healthPort)),
      );

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* Layer.build(app);
          expect((yield* probe(healthPort)).status).toBe(200);
          expect(yield* Effect.promise(() => connectionRefused(webPort))).toBe(
            true,
          );
        }),
      );

      expect(yield* Effect.promise(() => connectionRefused(healthPort))).toBe(
        true,
      );
    }),
  );

  // Mutation: take the host from `env.host` instead of writing `127.0.0.1` →
  // the external address connects, because the environment above binds the
  // web listener to a real interface.
  it.live.skipIf(externalAddresses().length === 0)(
    'binds the loopback alone, whatever the configured host is',
    () =>
      Effect.gen(function* () {
        const healthPort = yield* Effect.promise(freePort);
        const app = served(WorkerHealthServerLive).pipe(
          Layer.provide(
            Layer.succeed(Environment, {
              ...readEnv(),
              workerHealthPort: healthPort,
              // Every interface: the only thing keeping this listener off them
              // is the address written in the source.
              host: '0.0.0.0',
            }),
          ),
        );

        yield* Effect.scoped(
          Effect.gen(function* () {
            yield* Layer.build(app);
            // Reachable on the loopback first, so a refusal below is the bind
            // and not a listener that never came up.
            expect((yield* probe(healthPort)).status).toBe(200);

            for (const address of externalAddresses()) {
              expect({
                address,
                refused: yield* Effect.promise(() =>
                  connectionRefused(healthPort, address),
                ),
              }).toEqual({ address, refused: true });
            }
          }),
        );
      }),
  );
});

describe('NodeHttpServer.layerTest', () => {
  // The ephemeral-port harness the rest of the suite's HTTP cases will use:
  // proving it here means a later failure is the route rather than the wiring.
  // Mutation: register the route at a different path → the client gets a 404.
  it.live('serves a route to the test client', () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const response = yield* client.get('/probe');
      expect(response.status).toBe(200);
      expect(yield* response.text).toBe(PROBE_BODY);
    }).pipe(
      Effect.provide(
        HttpRouter.serve(probeRoute, {
          disableLogger: true,
          disableListenLog: true,
        }).pipe(Layer.provideMerge(NodeHttpServer.layerTest)),
      ),
    ),
  );
});
