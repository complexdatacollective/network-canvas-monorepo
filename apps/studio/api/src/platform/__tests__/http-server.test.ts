import { networkInterfaces } from 'node:os';

import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { HttpClient, HttpRouter, HttpServerResponse } from 'effect/http';

import {
  connectionRefused,
  freePort,
} from '../../__tests__/support/entrypoint.ts';
import { Environment, readEnv } from '../../env.ts';
import { HttpServerLive, WorkerHealthServerLive } from '../http-server.ts';

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
    host: '127.0.0.1',
  });

const probe = (port: number): Effect.Effect<Response> =>
  Effect.promise(() => fetch(`http://127.0.0.1:${port}/probe`));

describe('HttpServerLive', () => {
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

      expect(yield* Effect.promise(() => connectionRefused(port))).toBe(true);
    }),
  );
});

describe('WorkerHealthServerLive', () => {
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
              host: '0.0.0.0',
            }),
          ),
        );

        yield* Effect.scoped(
          Effect.gen(function* () {
            yield* Layer.build(app);
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
