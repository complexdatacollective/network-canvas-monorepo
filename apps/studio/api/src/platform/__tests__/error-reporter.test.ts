import { createServer } from 'node:http';

import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { describe, expect, it, layer } from '@effect/vitest';
import { Context, Effect, Layer, Option, Predicate, Schema } from 'effect';
import {
  FetchHttpClient,
  HttpRouter,
  HttpServer,
  HttpServerResponse,
} from 'effect/http';
import * as NetAddress from 'effect/net/NetAddress';
import { Rpc, RpcGroup, RpcSerialization, RpcServer } from 'effect/rpc';

import { TelemetryRpcs } from '@codaco/studio-contract/rpc/telemetry';
import { NotFound } from '@codaco/studio-contract/schema/errors';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { Environment, readEnv } from '../../env.ts';
import { ProblemJson } from '../../http/middleware/problem-json.ts';
import { RequestIdLive } from '../../http/middleware/request-id.ts';
import {
  clearQueue,
  enqueueDelivery,
  layerJobs,
  layerQueueHarness,
  onWorker,
  updateJob,
} from '../../jobs/__tests__/support.ts';
import { RateLimiter } from '../../rate-limit/limiter.ts';
import { RATE_LIMITS } from '../../rate-limit/scopes.ts';
import { RateLimitStore } from '../../rate-limit/store.ts';
import { TelemetryHandlers } from '../../rpc/handlers/telemetry.ts';
import { POSTHOG_INGESTION_HOST } from '../analytics.ts';
import { ErrorReporter } from '../error-reporter.ts';
import { InstallationIdentity } from '../installation-identity.ts';
import { recordRequestTeam } from '../request-team.ts';
import { ObservabilityLive } from '../tracing.ts';

const SECRET = 'jane.doe@example.org answered sensitive-answer';

const TEAM = 'team-under-test';

const INSTALLATION = 'installation-under-test';

const COLLECTOR = 'http://collector.test';

type Sent = { readonly url: string; readonly body: string };

const recordingFetch =
  (sent: Sent[]): typeof globalThis.fetch =>
  async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const body = await new Response(init?.body ?? null).text();
    sent.push({ url, body });
    return new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

type Destination = {
  readonly name: 'posthog' | 'otlp';
  readonly endpoint: string | undefined;
};

const DESTINATIONS: ReadonlyArray<Destination> = [
  { name: 'posthog', endpoint: undefined },
  { name: 'otlp', endpoint: COLLECTOR },
];

type Capture = {
  readonly type: string | undefined;
  readonly requestId: string | undefined;
  readonly teamId: string | undefined;
  readonly installationId: string | undefined;
  readonly origin: string | undefined;
  readonly queue: string | undefined;
  readonly surface?: string | undefined;
  readonly frames: string;
};

const Json = Schema.fromJsonString(Schema.Unknown);
const parse = Schema.decodeUnknownSync(Json);

const field = (value: unknown, key: string): unknown =>
  Predicate.isObject(value) && Predicate.hasProperty(value, key)
    ? value[key]
    : undefined;

const list = (value: unknown): ReadonlyArray<unknown> =>
  Array.isArray(value) ? value : [];

const text = (value: unknown): string | undefined =>
  Predicate.isString(value) ? value : undefined;

const postHogCaptures = (sent: ReadonlyArray<Sent>): Capture[] =>
  sent
    .filter((request) => request.url === `${POSTHOG_INGESTION_HOST}/batch/`)
    .flatMap((request) => list(field(parse(request.body), 'batch')))
    .filter((event) => field(event, 'event') === '$exception')
    .map((event) => {
      const properties = field(event, 'properties');
      const exception = list(field(properties, '$exception_list'))[0];
      return {
        type: text(field(exception, 'type')),
        requestId: text(field(properties, 'request_id')),
        teamId: text(field(properties, 'team_id')),
        installationId: text(field(properties, 'installation_id')),
        origin: text(field(properties, 'error_origin')),
        queue: text(field(properties, 'job_queue')),
        surface: text(field(properties, 'surface')),
        frames: JSON.stringify(field(exception, 'stacktrace')),
      };
    });

const attributesOf = (value: unknown): Record<string, string | undefined> =>
  Object.fromEntries(
    list(value).map((attribute) => [
      text(field(attribute, 'key')) ?? '',
      text(field(field(attribute, 'value'), 'stringValue')),
    ]),
  );

const otlpCaptures = (sent: ReadonlyArray<Sent>): Capture[] =>
  sent
    .filter((request) => request.url === `${COLLECTOR}/v1/logs`)
    .flatMap((request) => list(field(parse(request.body), 'resourceLogs')))
    .flatMap((resourceLogs) => {
      const resource = attributesOf(
        field(field(resourceLogs, 'resource'), 'attributes'),
      );
      return list(field(resourceLogs, 'scopeLogs'))
        .flatMap((scopeLogs) => list(field(scopeLogs, 'logRecords')))
        .filter(
          (record) =>
            field(field(record, 'body'), 'stringValue') ===
            'An unexpected failure was reported',
        )
        .map((record) => {
          const attributes = attributesOf(field(record, 'attributes'));
          return {
            type: attributes['exception.type'],
            requestId: attributes.request_id,
            teamId: attributes.team_id,
            installationId: resource['studio.installation_id'],
            origin: attributes.error_origin,
            queue: attributes.job_queue,
            surface: attributes.surface,
            frames: attributes['exception.stacktrace'] ?? '',
          };
        });
    });

const capturesAt = (
  destination: Destination,
  sent: ReadonlyArray<Sent>,
): Capture[] =>
  destination.name === 'posthog' ? postHogCaptures(sent) : otlpCaptures(sent);

const identities = (captures: ReadonlyArray<Capture>) =>
  captures.map(
    ({ frames: _frames, surface: _surface, ...identity }) => identity,
  );

const THIS_FILE =
  'apps/studio/api/src/platform/__tests__/error-reporter.test.ts';

const BROWSER_REPORT = {
  surface: 'participant',
  type: 'TypeError',
  frames: [
    {
      filename: '/assets/InterviewSession-vGup0j8k.js',
      function: 'renderStage',
      lineno: 12,
      colno: 34,
      chunkId: '0e9b3c7a-5d1f-42a8-b6c4-e2d0f8a17593',
    },
  ],
};

const telemetryUnder = (destination: Destination, telemetry = true) =>
  ObservabilityLive('serve').pipe(
    Layer.provide(
      Layer.succeed(Environment, {
        ...readEnv(),
        telemetry,
        telemetryEndpoint: destination.endpoint,
        telemetryHeaders: undefined,
      }),
    ),
  );

class Probes extends RpcGroup.make(
  Rpc.make('probe.defect'),
  Rpc.make('probe.secret'),
  Rpc.make('probe.refuse', { error: NotFound }),
  Rpc.make('probe.hang'),
) {}

const ProbeHandlers = Probes.toLayer({
  'probe.defect': () =>
    recordRequestTeam(TEAM).pipe(
      Effect.andThen(Effect.die(new Error('the handler exploded'))),
    ),
  'probe.secret': () =>
    recordRequestTeam(TEAM).pipe(
      Effect.andThen(
        Effect.die(
          new Error(
            `could not store ${SECRET}\n    at ${SECRET.replaceAll(' ', '_')} (/srv/${TEAM}/secret.ts:1:1)`,
          ),
        ),
      ),
    ),
  'probe.refuse': () =>
    recordRequestTeam(TEAM).pipe(Effect.andThen(new NotFound({}))),
  'probe.hang': () =>
    recordRequestTeam(TEAM).pipe(Effect.andThen(Effect.never)),
});

const SHARED_DEFECT = new Error('one error object thrown by every request');

const LEAKY_NAME = Object.assign(new Error('named by a library'), {
  name: `Refused for ${TEAM} by jane.doe`,
});

const DEFAULT_LIMITER = RateLimiter.layer.pipe(
  Layer.provide(RateLimitStore.layerAbsent),
);

const probeRoutes = (limiter: Layer.Layer<RateLimiter>) =>
  Layer.mergeAll(
    RpcServer.layerHttp({ group: Probes, path: '/rpc', protocol: 'http' }).pipe(
      Layer.provide(ProbeHandlers),
      Layer.provide(RpcSerialization.layerNdjson),
    ),
    RpcServer.layerHttp({
      group: TelemetryRpcs,
      path: '/telemetry',
      protocol: 'http',
    }).pipe(
      Layer.provide(TelemetryHandlers),
      Layer.provide(RpcSerialization.layerNdjson),
      Layer.provide(limiter),
    ),
    HttpRouter.add(
      'GET',
      '/primitive',
      recordRequestTeam(TEAM).pipe(Effect.andThen(Effect.die('failed'))),
    ),
    HttpRouter.add(
      'GET',
      '/shared',
      recordRequestTeam(TEAM).pipe(Effect.andThen(Effect.die(SHARED_DEFECT))),
    ),
    HttpRouter.add(
      'GET',
      '/named',
      recordRequestTeam(TEAM).pipe(Effect.andThen(Effect.die(LEAKY_NAME))),
    ),
    HttpRouter.add(
      'GET',
      '/defect',
      recordRequestTeam(TEAM).pipe(
        Effect.andThen(Effect.die(new Error('the route exploded'))),
      ),
    ),
    HttpRouter.add(
      'GET',
      '/failure',
      recordRequestTeam(TEAM).pipe(
        Effect.andThen(Effect.fail(new Error(`the store said ${SECRET}`))),
      ),
    ),
    HttpRouter.add(
      'GET',
      '/hang',
      recordRequestTeam(TEAM).pipe(Effect.andThen(Effect.never)),
    ),
    HttpRouter.add('GET', '/ok', HttpServerResponse.text('ok')),
  ).pipe(
    Layer.provideMerge(RequestIdLive.pipe(Layer.provideMerge(ProblemJson))),
  );

const ProbeRoutes = probeRoutes(DEFAULT_LIMITER);

type Probe = (origin: string) => Promise<Response | null>;

const rpc =
  (
    tag: string,
    abortAfterMs?: number,
    payload: unknown = null,
    path = '/rpc',
  ): Probe =>
  async (origin) => {
    const abort = new AbortController();
    if (abortAfterMs !== undefined) {
      setTimeout(() => abort.abort(), abortAfterMs);
    }
    try {
      const response = await fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/ndjson' },
        body: `${JSON.stringify({ _tag: 'Request', id: '1', tag, payload, headers: [] })}\n`,
        signal: abort.signal,
      });
      await response.text();
      return response;
    } catch {
      return null;
    }
  };

const get =
  (path: string, abortAfterMs?: number): Probe =>
  async (origin) => {
    const abort = new AbortController();
    if (abortAfterMs !== undefined) {
      setTimeout(() => abort.abort(), abortAfterMs);
    }
    try {
      const response = await fetch(`${origin}${path}`, {
        signal: abort.signal,
      });
      await response.text();
      return response;
    } catch {
      return null;
    }
  };

const serveAndProbe = (
  destination: Destination,
  probe: Probe,
  telemetry = true,
  routes = ProbeRoutes,
) =>
  Effect.gen(function* () {
    const sent: Sent[] = [];
    const response = yield* Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(
          HttpRouter.serve(routes, {
            disableLogger: true,
            disableListenLog: true,
          }).pipe(
            Layer.provideMerge(
              NodeHttpServer.layer(createServer, {
                port: 0,
                host: '127.0.0.1',
              }),
            ),
            Layer.provideMerge(telemetryUnder(destination, telemetry)),
          ),
        );
        yield* Context.get(context, InstallationIdentity).record(INSTALLATION);
        const address = Context.get(context, HttpServer.HttpServer).address;
        if (NetAddress.isUnixPathAddress(address)) {
          return yield* Effect.die(new Error('expected a TCP listener'));
        }
        const answered = yield* Effect.promise(() =>
          probe(`http://127.0.0.1:${address.port}`),
        );
        yield* Effect.sleep('300 millis');
        return answered;
      }),
    ).pipe(Effect.provideService(FetchHttpClient.Fetch, recordingFetch(sent)));
    return {
      response,
      sent,
      captures: capturesAt(destination, sent),
      everything: sent.map((request) => request.body).join('\n'),
    };
  });

describe.each(DESTINATIONS)('ErrorReporter ($name)', (destination) => {
  it.live(
    'captures a defect in an rpc handler once, with its request and team',
    () =>
      Effect.gen(function* () {
        const { response, captures } = yield* serveAndProbe(
          destination,
          rpc('probe.defect'),
        );
        const requestId = response?.headers.get('x-request-id');
        expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
        expect(captures[0]?.frames).toContain(THIS_FILE);
        expect(identities(captures)).toEqual([
          {
            type: 'Error',
            requestId,
            teamId: TEAM,
            installationId: INSTALLATION,
            origin: 'request',
            queue: undefined,
          },
        ]);
      }),
  );

  it.live(
    'captures a defect in an http route once, with its request and team',
    () =>
      Effect.gen(function* () {
        const { response, captures } = yield* serveAndProbe(
          destination,
          get('/defect'),
        );
        expect(response?.status).toBe(500);
        expect(captures[0]?.frames).toContain(THIS_FILE);
        expect(identities(captures)).toEqual([
          {
            type: 'Error',
            requestId: response?.headers.get('x-request-id'),
            teamId: TEAM,
            installationId: INSTALLATION,
            origin: 'request',
            queue: undefined,
          },
        ]);
      }),
  );

  it.live('captures nothing for an interrupted rpc or http request', () =>
    Effect.gen(function* () {
      const rpcAborted = yield* serveAndProbe(
        destination,
        rpc('probe.hang', 100),
      );
      expect(rpcAborted.response).toBeNull();
      expect(rpcAborted.captures).toEqual([]);
      const httpAborted = yield* serveAndProbe(destination, get('/hang', 100));
      expect(httpAborted.response).toBeNull();
      expect(httpAborted.captures).toEqual([]);
    }),
  );

  it.live('captures nothing for a typed refusal', () =>
    Effect.gen(function* () {
      const refused = yield* serveAndProbe(destination, rpc('probe.refuse'));
      expect(refused.response?.status).toBe(200);
      expect(refused.captures).toEqual([]);
      const notFound = yield* serveAndProbe(destination, get('/not-here'));
      expect(notFound.response?.status).toBe(404);
      expect(notFound.captures).toEqual([]);
    }),
  );

  it.live('sends the type and frames of a failure but never its message', () =>
    Effect.gen(function* () {
      for (const probe of [rpc('probe.secret'), get('/failure')]) {
        const { captures, everything } = yield* serveAndProbe(
          destination,
          probe,
        );
        expect(captures).toHaveLength(1);
        expect(captures[0]?.type).toBe('Error');
        expect(everything).not.toContain('jane.doe');
        expect(everything).not.toContain('sensitive-answer');
        expect(everything).not.toContain(TEAM.concat('/secret'));
      }
    }),
  );

  it.live('captures a primitive defect once', () =>
    Effect.gen(function* () {
      const { response, captures } = yield* serveAndProbe(
        destination,
        get('/primitive'),
      );
      expect(response?.status).toBe(500);
      expect(captures).toHaveLength(1);
    }),
  );

  it.live('captures every request that fails with the same error object', () =>
    Effect.gen(function* () {
      const { captures } = yield* serveAndProbe(destination, async (origin) => {
        await get('/shared')(origin);
        return get('/shared')(origin);
      });
      expect(captures).toHaveLength(2);
      expect(new Set(captures.map((capture) => capture.requestId)).size).toBe(
        2,
      );
    }),
  );

  it.live('exports a type that is not an identifier as Error', () =>
    Effect.gen(function* () {
      const { captures, everything } = yield* serveAndProbe(
        destination,
        get('/named'),
      );
      expect(captures).toHaveLength(1);
      expect(captures[0]?.type).toBe('Error');
      expect(everything).not.toContain('jane.doe');
      expect(everything).not.toContain(`Refused for ${TEAM}`);
    }),
  );

  it.live(
    'forwards a browser report with its type, bundle frames and surface',
    () =>
      Effect.gen(function* () {
        const { response, captures } = yield* serveAndProbe(
          destination,
          rpc('telemetry.report', undefined, BROWSER_REPORT, '/telemetry'),
        );
        expect(identities(captures)).toEqual([
          {
            type: 'TypeError',
            requestId: response?.headers.get('x-request-id'),
            teamId: undefined,
            installationId: INSTALLATION,
            origin: 'browser',
            queue: undefined,
          },
        ]);
        expect(captures[0]?.surface).toBe('participant');
        expect(captures[0]?.frames).toContain(
          '/assets/InterviewSession-vGup0j8k.js',
        );
        expect(captures[0]?.frames).toContain('renderStage');
      }),
  );

  it.live('refuses a browser report that names anything but a bundle', () =>
    Effect.gen(function* () {
      const { captures, everything } = yield* serveAndProbe(
        destination,
        rpc(
          'telemetry.report',
          undefined,
          {
            ...BROWSER_REPORT,
            frames: [
              {
                ...BROWSER_REPORT.frames[0],
                filename: '/participant/session/secret-session-token',
              },
            ],
          },
          '/telemetry',
        ),
      );
      expect(captures).toEqual([]);
      expect(everything).not.toContain('secret-session-token');
    }),
  );

  it.live('charges the browser report limit even with telemetry off', () =>
    Effect.gen(function* () {
      const charged: string[] = [];
      const recording = Layer.succeed(RateLimiter, {
        configured: true,
        rules: RATE_LIMITS,
        check: (scope) =>
          Effect.sync(() => {
            charged.push(scope);
            return { allowed: true };
          }),
        consume: () => Effect.succeed({ allowed: true }),
        readiness: Effect.succeed('ok' as const),
      });
      const { captures } = yield* serveAndProbe(
        destination,
        rpc('telemetry.report', undefined, BROWSER_REPORT, '/telemetry'),
        false,
        probeRoutes(recording),
      );
      expect(charged).toEqual(['error_report_address']);
      expect(captures).toEqual([]);
    }),
  );

  it.live('is never built, and sends nothing, with telemetry off', () =>
    Effect.gen(function* () {
      const built = yield* Effect.scoped(
        Effect.map(Layer.build(telemetryUnder(destination, false)), (context) =>
          Context.getOption(context, ErrorReporter),
        ),
      );
      expect(Option.isNone(built)).toBe(true);
      const { response, sent } = yield* serveAndProbe(
        destination,
        rpc('probe.defect'),
        false,
      );
      expect(response?.status).toBe(200);
      expect(sent).toEqual([]);
      const dropped = yield* serveAndProbe(
        destination,
        rpc('telemetry.report', undefined, BROWSER_REPORT, '/telemetry'),
        false,
      );
      expect(dropped.response?.status).toBe(200);
      expect(dropped.sent).toEqual([]);
    }),
  );
});

const db = await reachableDb();

describe.skipIf(!db)('ErrorReporter in the job worker', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (queued) => {
    for (const destination of DESTINATIONS) {
      queued.effect(
        `captures a job the lease reaper fails, never one it retries (${destination.name})`,
        () =>
          Effect.gen(function* () {
            yield* clearQueue;
            const sent: Sent[] = [];
            yield* Effect.scoped(
              Effect.gen(function* () {
                const context = yield* Layer.build(telemetryUnder(destination));
                yield* Context.get(context, InstallationIdentity).record(
                  INSTALLATION,
                );
                const retried = yield* enqueueDelivery();
                yield* updateJob(
                  retried,
                  `state = 'active', attempts = 1, locked_until = to_timestamp(0)`,
                );
                const final = yield* enqueueDelivery(
                  '77777777-7777-4777-8777-777777777777',
                );
                yield* updateJob(
                  final,
                  `state = 'active', attempts = 1, retry_limit = 0, locked_until = to_timestamp(0)`,
                );
                const reaped = yield* onWorker(
                  (worker) => worker.reapExpired,
                ).pipe(Effect.provide(context));
                expect(reaped).toBe(2);
              }),
            ).pipe(
              Effect.provideService(
                FetchHttpClient.Fetch,
                recordingFetch(sent),
              ),
            );
            expect(identities(capturesAt(destination, sent))).toEqual([
              {
                type: 'JobLeaseExpired',
                requestId: undefined,
                teamId: undefined,
                installationId: INSTALLATION,
                origin: 'job',
                queue: 'invitation-delivery',
              },
            ]);
          }).pipe(Effect.provide(layerJobs)),
      );

      queued.effect(
        `captures a job's final failure once, never a retried attempt (${destination.name})`,
        () =>
          Effect.gen(function* () {
            yield* clearQueue;
            const sent: Sent[] = [];
            yield* Effect.scoped(
              Effect.gen(function* () {
                const context = yield* Layer.build(telemetryUnder(destination));
                yield* Context.get(context, InstallationIdentity).record(
                  INSTALLATION,
                );
                const drain = onWorker((worker) =>
                  worker
                    .work('invitation-delivery', () =>
                      Effect.die(new Error(`could not mail ${SECRET}`)),
                    )
                    .pipe(
                      Effect.andThen(worker.drainOnce('invitation-delivery')),
                    ),
                ).pipe(Effect.provide(context));
                yield* enqueueDelivery();
                const retried = yield* drain;
                expect(retried._tag).toBe('retrying');
                const final = yield* enqueueDelivery(
                  '66666666-6666-4666-8666-666666666666',
                );
                yield* updateJob(final, 'retry_limit = 0');
                const failed = yield* drain;
                expect(failed._tag).toBe('failed');
              }),
            ).pipe(
              Effect.provideService(
                FetchHttpClient.Fetch,
                recordingFetch(sent),
              ),
            );
            const captures = capturesAt(destination, sent);
            expect(identities(captures)).toEqual([
              {
                type: 'Error',
                requestId: undefined,
                teamId: undefined,
                installationId: INSTALLATION,
                origin: 'job',
                queue: 'invitation-delivery',
              },
            ]);
            expect(
              sent.map((request) => request.body).join('\n'),
            ).not.toContain('jane.doe');
          }).pipe(Effect.provide(layerJobs)),
      );
    }
  });
});
