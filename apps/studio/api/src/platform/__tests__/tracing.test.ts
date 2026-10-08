import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it } from '@effect/vitest';
import { Cause, Effect, Layer, Metric, Redacted } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { POSTHOG_API_KEY } from '@codaco/shared-consts';

import { Environment, readEnv } from '../../env.ts';
import { RequestId } from '../../http/middleware/request-id.ts';
import { InstallationIdentity } from '../installation-identity.ts';
import { POSTHOG_OTLP_ENDPOINT, TracingLive } from '../tracing.ts';

type Received = {
  readonly path: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
};

type Sink = {
  readonly url: string;
  readonly received: Received[];
  readonly close: () => Promise<void>;
};

function startSink(): Promise<Sink> {
  const received: Received[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      received.push({
        path: request.url ?? '',
        headers: request.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}');
    });
  });
  return new Promise<Sink>((listening) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const { port } = address as AddressInfo;
      listening({
        url: `http://127.0.0.1:${port}`,
        received,
        close: () =>
          new Promise<void>((closed) => {
            server.close(() => closed());
          }),
      });
    });
  });
}

const withSink = <A, E, R>(
  use: (sink: Sink) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(Effect.promise(startSink), use, (sink) =>
    Effect.promise(sink.close),
  );

const SECRET = 'participant-said-something-private';

const exercise = Effect.gen(function* () {
  const identity = yield* InstallationIdentity;
  yield* identity.record('installation-1');
  yield* Effect.logInfo('telemetry probe').pipe(
    Effect.provideService(RequestId, 'request-1'),
    Effect.withSpan('probe'),
  );
  yield* Effect.logError(
    'telemetry probe failed',
    Cause.fail(new Error(`refused: ${SECRET}`)),
  );
  yield* Effect.fail(new Error(`span failure: ${SECRET}`)).pipe(
    Effect.withSpan('failing probe'),
    Effect.ignore,
  );
  yield* Metric.update(Metric.gauge('studio_test_probe'), 1);
});

type Options = {
  readonly telemetry: boolean;
  readonly telemetryEndpoint?: string | undefined;
  readonly telemetryHeaders?: Readonly<Record<string, string>> | undefined;
};

const exportUnder = (options: Options, fetch: typeof globalThis.fetch) =>
  exercise.pipe(
    Effect.provide(
      TracingLive('serve').pipe(
        Layer.provide(
          Layer.succeed(Environment, {
            ...readEnv(),
            telemetry: options.telemetry,
            telemetryEndpoint: options.telemetryEndpoint,
            telemetryHeaders:
              options.telemetryHeaders === undefined
                ? undefined
                : Redacted.make(options.telemetryHeaders),
          }),
        ),
      ),
    ),
    Effect.provideService(FetchHttpClient.Fetch, fetch),
  );

const redirecting =
  (sink: Sink, calls: string[]): typeof globalThis.fetch =>
  (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    return globalThis.fetch(
      url.startsWith(POSTHOG_OTLP_ENDPOINT)
        ? `${sink.url}${url.slice(POSTHOG_OTLP_ENDPOINT.length)}`
        : url,
      init,
    );
  };

const bodyAt = (sink: Sink, path: string): string =>
  sink.received
    .filter((request) => request.path.endsWith(path))
    .map((request) => request.body)
    .join('\n');

describe('TracingLive', () => {
  it.live('builds no exporter and contacts nothing when telemetry is off', () =>
    withSink((sink) =>
      Effect.gen(function* () {
        const calls: string[] = [];
        yield* exportUnder(
          { telemetry: false, telemetryEndpoint: sink.url },
          redirecting(sink, calls),
        );
        yield* exportUnder({ telemetry: false }, redirecting(sink, calls));
        expect(calls).toEqual([]);
        expect(sink.received).toEqual([]);
      }),
    ),
  );

  it.live(
    'sends spans, log records and metrics to the configured endpoint with its headers',
    () =>
      withSink((sink) =>
        Effect.gen(function* () {
          const calls: string[] = [];
          yield* exportUnder(
            {
              telemetry: true,
              telemetryEndpoint: sink.url,
              telemetryHeaders: { 'x-collector-key': 'collector-secret' },
            },
            redirecting(sink, calls),
          );
          expect(calls.every((url) => url.startsWith(sink.url))).toBe(true);
          expect(bodyAt(sink, '/v1/traces')).toContain('"resourceSpans"');
          expect(bodyAt(sink, '/v1/logs')).toContain('"logRecords"');
          expect(bodyAt(sink, '/v1/metrics')).toContain('"resourceMetrics"');
          for (const request of sink.received) {
            expect(request.headers['x-collector-key']).toBe('collector-secret');
            expect(request.headers.authorization).toBeUndefined();
          }
        }),
      ),
  );

  it.live(
    'sends them to Codaco’s PostHog project with its project key when no endpoint is set',
    () =>
      withSink((sink) =>
        Effect.gen(function* () {
          const calls: string[] = [];
          yield* exportUnder({ telemetry: true }, redirecting(sink, calls));
          expect(calls.length).toBeGreaterThan(0);
          expect(
            calls.every((url) =>
              url.startsWith(`${POSTHOG_OTLP_ENDPOINT}/v1/`),
            ),
          ).toBe(true);
          expect(bodyAt(sink, '/v1/traces')).toContain('"resourceSpans"');
          expect(bodyAt(sink, '/v1/logs')).toContain('"logRecords"');
          expect(bodyAt(sink, '/v1/metrics')).toContain('"resourceMetrics"');
          for (const request of sink.received) {
            expect(request.headers.authorization).toBe(
              `Bearer ${POSTHOG_API_KEY}`,
            );
          }
        }),
      ),
  );

  it.live(
    'exports a failure as its type and stack frames, never its message',
    () =>
      withSink((sink) =>
        Effect.gen(function* () {
          yield* exportUnder(
            { telemetry: true, telemetryEndpoint: sink.url },
            globalThis.fetch,
          );
          const traces = bodyAt(sink, '/v1/traces');
          const logs = bodyAt(sink, '/v1/logs');
          expect(traces).toContain('"exception.type"');
          expect(logs).toContain('"exception.type"');
          expect(logs).toContain('"exception.stacktrace"');
          expect(traces).not.toContain('"exception.message"');
          expect(logs).not.toContain('"log.error"');
          for (const request of sink.received) {
            expect(request.body).not.toContain(SECRET);
          }
        }),
      ),
  );

  it.live(
    'stamps the installation id on every export and the request id on records written in a request',
    () =>
      withSink((sink) =>
        Effect.gen(function* () {
          yield* exportUnder(
            { telemetry: true, telemetryEndpoint: sink.url },
            globalThis.fetch,
          );
          for (const path of ['/v1/traces', '/v1/logs', '/v1/metrics']) {
            expect(bodyAt(sink, path)).toContain(
              '{"key":"studio.installation_id","value":{"stringValue":"installation-1"}}',
            );
          }
          expect(bodyAt(sink, '/v1/logs')).toContain(
            '{"key":"request_id","value":{"stringValue":"request-1"}}',
          );
        }),
      ),
  );
});
