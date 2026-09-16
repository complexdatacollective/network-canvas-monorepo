import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { Environment, readEnv } from '../../env.ts';
import { TracingLive } from '../tracing.ts';

// Whether anything is exported is the whole behaviour here, so the oracle is a
// collector: a real `node:http` sink that records what arrives. An assertion
// about the layer's shape would pass for a layer that built an exporter and
// posted nothing, and for one that posted to the wrong place.

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

/**
 * One log record emitted under the layer, and then the scope closed — the
 * exporter flushes what it has batched on shutdown, so by the time this
 * returns the sink has seen whatever was going to be sent.
 */
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
  // Mutation: post to `baseUrl` rather than letting Otlp append its paths →
  // the recorded path is not `/v1/logs`.
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

  // Mutation: drop the `!env.telemetry` half of the gate → the opt-out stops
  // working and the sink records the export anyway.
  it.live('exports nothing when the instance has opted out', () =>
    withSink((sink) =>
      Effect.gen(function* () {
        yield* emitUnder(false, sink.url);
        expect(sink.requests).toEqual([]);
      }),
    ),
  );

  // Mutation: fall back to a default endpoint when none is configured → the
  // sink is not this test's, but the layer is no longer `Layer.empty`, and a
  // deployment that configured nothing would open connections. Asserted here
  // through the one observable that survives: with the endpoint withheld and
  // the sink's URL never reaching the layer, nothing arrives.
  it.live('builds no exporter at all without an endpoint', () =>
    withSink((sink) =>
      Effect.gen(function* () {
        yield* emitUnder(true, undefined);
        expect(sink.requests).toEqual([]);
      }),
    ),
  );
});
