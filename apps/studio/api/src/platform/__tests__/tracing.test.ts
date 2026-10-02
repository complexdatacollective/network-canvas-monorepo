import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { Environment, readEnv } from '../../env.ts';
import { TracingLive } from '../tracing.ts';

type Sink = {
  readonly url: string;
  readonly requests: { method: string; path: string }[];
  readonly close: () => Promise<void>;
};

function startSink(): Promise<Sink> {
  const requests: { method: string; path: string }[] = [];
  const server: Server = createServer((request, response) => {
    requests.push({ method: request.method ?? '', path: request.url ?? '' });
    request.resume();
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}');
    });
  });
  return new Promise<Sink>((listening) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      listening({
        url: `http://127.0.0.1:${address.port}`,
        requests,
        close: () =>
          new Promise<void>((closed) => {
            server.close(() => closed());
          }),
      });
    });
  });
}

const environment = (
  telemetry: boolean,
  telemetryEndpoint: string | undefined,
) => Layer.succeed(Environment, { ...readEnv(), telemetry, telemetryEndpoint });

const emitUnder = (
  telemetry: boolean,
  telemetryEndpoint: string | undefined,
): Effect.Effect<void> =>
  Effect.provide(
    Effect.logInfo('telemetry probe'),
    TracingLive('serve').pipe(
      Layer.provide(environment(telemetry, telemetryEndpoint)),
    ),
  );

const withSink = <A>(use: (sink: Sink) => Effect.Effect<A>): Effect.Effect<A> =>
  Effect.acquireUseRelease(Effect.promise(startSink), use, (sink) =>
    Effect.promise(sink.close),
  );

describe('TracingLive', () => {
  it.live('exports logs to the configured collector', () =>
    withSink((sink) =>
      Effect.gen(function* () {
        yield* emitUnder(true, sink.url);

        const logs = sink.requests.filter((request) =>
          request.path.endsWith('/v1/logs'),
        );
        expect(logs.length).toBeGreaterThan(0);
        expect(logs[0]?.method).toBe('POST');
      }),
    ),
  );

  it.live('exports nothing when the instance has opted out', () =>
    withSink((sink) =>
      Effect.gen(function* () {
        yield* emitUnder(false, sink.url);
        expect(sink.requests).toEqual([]);
      }),
    ),
  );

  it.live('builds no exporter at all without an endpoint', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const recording: typeof globalThis.fetch = (input, init) => {
        calls.push(String(input instanceof Request ? input.url : input));
        return globalThis.fetch(input, init);
      };

      yield* withSink((sink) =>
        Effect.gen(function* () {
          yield* emitUnder(true, sink.url).pipe(
            Effect.provideService(FetchHttpClient.Fetch, recording),
          );
          expect(calls.length).toBeGreaterThan(0);
          calls.length = 0;

          yield* emitUnder(true, undefined).pipe(
            Effect.provideService(FetchHttpClient.Fetch, recording),
          );
          expect(calls).toEqual([]);
        }),
      );
    }),
  );
});
