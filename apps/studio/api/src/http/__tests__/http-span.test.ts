import { createServer } from 'node:http';

import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer, Tracer } from 'effect';
import { HttpRouter, HttpServer, HttpServerResponse } from 'effect/http';
import * as NetAddress from 'effect/net/NetAddress';

import { PARTICIPANT_SESSION_HEADER } from '@codaco/studio-contract/middleware/session';

import { ServerTelemetryLive } from '../../platform/http-server.ts';
import { WorkerHealthRoutes } from '../health.ts';
import { HttpSpanLive } from '../middleware/http-span.ts';

const SEEDS = {
  query: 'token=link-token-in-the-query',
  session: 'team.participant-session-token',
  userAgent: 'Probe/1.0 (seeded user agent)',
  forwardedFor: '203.0.113.77',
  referer: 'https://studio.example.org/teams/secret-team-name',
};

const ALLOWED = new Set([
  'http.request.method',
  'http.route',
  'http.response.status_code',
]);

const PROBE_ROUTES = Layer.mergeAll(
  HttpRouter.add(
    'GET',
    '/probe/:id',
    HttpServerResponse.text('ok', { status: 202 }),
  ),
  HttpRouter.add('GET', '/failing', Effect.fail(new Error('refused'))),
  HttpRouter.add('GET', '/dying', Effect.die(new Error('broken'))),
).pipe(Layer.provideMerge(HttpSpanLive));

const serverSpans = (
  telemetry: Layer.Layer<never>,
  path = `/probe/42?${SEEDS.query}`,
  routes:
    | typeof PROBE_ROUTES
    | ReturnType<typeof WorkerHealthRoutes> = PROBE_ROUTES,
) =>
  Effect.gen(function* () {
    const spans: Tracer.NativeSpan[] = [];
    const recording = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    const Served = HttpRouter.serve(routes, {
      disableLogger: true,
      disableListenLog: true,
    }).pipe(
      Layer.provide(telemetry),
      Layer.provideMerge(
        NodeHttpServer.layer(createServer, { port: 0, host: '127.0.0.1' }),
      ),
      Layer.provide(Layer.succeed(Tracer.Tracer, recording)),
    );
    yield* Effect.gen(function* () {
      const address = (yield* HttpServer.HttpServer).address;
      if (NetAddress.isUnixPathAddress(address)) {
        return yield* Effect.die(new Error('expected a TCP listener'));
      }
      yield* Effect.promise(() =>
        fetch(`http://127.0.0.1:${address.port}${path}`, {
          headers: {
            [PARTICIPANT_SESSION_HEADER]: SEEDS.session,
            'user-agent': SEEDS.userAgent,
            'x-forwarded-for': SEEDS.forwardedFor,
            'referer': SEEDS.referer,
            'traceparent':
              '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
          },
        }),
      );
    }).pipe(Effect.provide(Served));
    yield* Effect.sleep('20 millis');
    return spans.filter((span) => span.kind === 'server');
  });

const attributeText = (span: Tracer.NativeSpan): string =>
  JSON.stringify([...span.attributes]);

describe('the span a request records', () => {
  it.live(
    'is one root span holding only the method, route template and status',
    () =>
      Effect.gen(function* () {
        const spans = yield* serverSpans(ServerTelemetryLive);
        expect(spans).toHaveLength(1);
        const [span] = spans;
        expect(span?.parent._tag).toBe('None');
        expect(span?.traceId).not.toBe('0af7651916cd43dd8448eb211c80319c');
        expect(Object.fromEntries(span?.attributes ?? [])).toEqual({
          'http.request.method': 'GET',
          'http.route': '/probe/:id',
          'http.response.status_code': 202,
        });
        for (const key of span?.attributes.keys() ?? []) {
          expect(ALLOWED.has(key)).toBe(true);
        }
        for (const seed of Object.values(SEEDS)) {
          expect(attributeText(span!)).not.toContain(seed);
        }
      }),
  );

  it.live.each(['/failing', '/dying'])(
    'records the status of the error response a %s route ends in',
    (path) =>
      Effect.gen(function* () {
        const spans = yield* serverSpans(ServerTelemetryLive, path);
        expect(spans).toHaveLength(1);
        expect(spans[0]?.attributes.get('http.response.status_code')).toBe(500);
      }),
  );

  it.live('is recorded the same way by the worker health listener', () =>
    Effect.gen(function* () {
      const spans = yield* serverSpans(
        ServerTelemetryLive,
        '/healthz',
        WorkerHealthRoutes({}),
      );
      expect(spans).toHaveLength(1);
      expect(Object.fromEntries(spans[0]?.attributes ?? [])).toEqual({
        'http.request.method': 'GET',
        'http.route': '/healthz',
        'http.response.status_code': 200,
      });
    }),
  );

  it.live(
    'would also carry the URL, headers, user agent and inbound trace without Studio’s server telemetry',
    () =>
      Effect.gen(function* () {
        const spans = yield* serverSpans(Layer.empty);
        const builtIn = spans.find((span) => span.attributes.has('url.full'));
        expect(builtIn).toBeDefined();
        expect(attributeText(builtIn!)).toContain(SEEDS.query);
        expect(attributeText(builtIn!)).toContain(SEEDS.userAgent);
      }),
  );
});
