import { createServer } from 'node:http';

import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { describe, expect, it, layer } from '@effect/vitest';
import {
  Context,
  Effect,
  Layer,
  type LogLevel,
  Option,
  Predicate,
  Redacted,
  Schema,
} from 'effect';
import { FetchHttpClient, HttpRouter, HttpServer } from 'effect/http';
import * as NetAddress from 'effect/net/NetAddress';

import { POSTHOG_API_KEY } from '@codaco/shared-consts';
import { PARTICIPANT_SESSION_HEADER } from '@codaco/studio-contract/middleware/session';
import {
  BROWSER_LOG_PATHS,
  MAX_BROWSER_LOG_BODY_BYTES,
} from '@codaco/studio-contract/schema/browser-logs';

import { AuthServiceStub } from '../../__tests__/support/auth.ts';
import { TestDatabaseLive, testDb } from '../../__tests__/support/database.ts';
import type { AuthService } from '../../auth/service.ts';
import { type Database, DatabaseAbsent } from '../../db/client.ts';
import { Environment, readEnv } from '../../env.ts';
import {
  insertSession,
  seedInterviewFixture,
  tokenFor,
} from '../../interview/__tests__/fixture.ts';
import { ServerTelemetryLive } from '../../platform/http-server.ts';
import { InstallationIdentity } from '../../platform/installation-identity.ts';
import {
  ObservabilityLive,
  POSTHOG_OTLP_ENDPOINT,
} from '../../platform/tracing.ts';
import { RateLimiter } from '../../rate-limit/limiter.ts';
import { RATE_LIMITS } from '../../rate-limit/scopes.ts';
import { RateLimitStore } from '../../rate-limit/store.ts';
import { BrowserLogRoutes } from '../browser-logs.ts';

const COLLECTOR = 'http://collector.test';

const INSTALLATION = 'installation-under-test';

const USER = 'user-under-test';

const MEMBER_TEAM = 'team-the-researcher-belongs-to';

const OTHER_TEAM = 'team-the-researcher-does-not-belong-to';

const SECRET = 'jane.doe@example.org';

const env = readEnv();

const ORIGIN = new URL(env.auth?.baseUrl ?? 'http://localhost:5173').origin;

type Sent = {
  readonly url: string;
  readonly body: string;
  readonly headers: Headers;
};

type Destination = {
  readonly name: 'posthog' | 'otlp';
  readonly endpoint: string | undefined;
  readonly logsUrl: string;
};

const DESTINATIONS: ReadonlyArray<Destination> = [
  {
    name: 'posthog',
    endpoint: undefined,
    logsUrl: `${POSTHOG_OTLP_ENDPOINT}/v1/logs`,
  },
  { name: 'otlp', endpoint: COLLECTOR, logsUrl: `${COLLECTOR}/v1/logs` },
];

const recordingFetch =
  (sent: Sent[]): typeof globalThis.fetch =>
  async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const body = await new Response(init?.body ?? null).text();
    sent.push({ url, body, headers: new Headers(init?.headers) });
    return new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

const Json = Schema.fromJsonString(Schema.Unknown);
const parse = Schema.decodeUnknownSync(Json);

const field = (value: unknown, key: string): unknown =>
  Predicate.isObject(value) && Predicate.hasProperty(value, key)
    ? value[key]
    : undefined;

const list = (value: unknown): ReadonlyArray<unknown> =>
  Array.isArray(value) ? value : [];

const attributesOf = (value: unknown): Record<string, unknown> =>
  Object.fromEntries(
    list(value).map((attribute) => {
      const raw = field(attribute, 'value');
      return [
        field(attribute, 'key'),
        field(raw, 'stringValue') ?? field(raw, 'intValue'),
      ];
    }),
  );

type Forwarded = {
  readonly message: unknown;
  readonly level: unknown;
  readonly attributes: Record<string, unknown>;
  readonly resource: Record<string, unknown>;
};

const forwardedFrom = (
  destination: Destination,
  sent: ReadonlyArray<Sent>,
): Forwarded[] =>
  sent
    .filter((request) => request.url === destination.logsUrl)
    .flatMap((request) => list(field(parse(request.body), 'resourceLogs')))
    .flatMap((resourceLogs) => {
      const resource = attributesOf(
        field(field(resourceLogs, 'resource'), 'attributes'),
      );
      return list(field(resourceLogs, 'scopeLogs'))
        .flatMap((scopeLogs) => list(field(scopeLogs, 'logRecords')))
        .map((record) => ({
          message: field(field(record, 'body'), 'stringValue'),
          level: field(record, 'severityText'),
          attributes: attributesOf(field(record, 'attributes')),
          resource,
        }))
        .filter((record) => record.resource['service.name'] === 'studio-web');
    });

type WireAttribute = readonly [string, string | number];

const wireRecord = (
  message: string,
  level: string,
  attributes: ReadonlyArray<WireAttribute>,
) => ({
  timeUnixNano: '1760000000000000000',
  severityText: level,
  body: { stringValue: message },
  attributes: attributes.map(([key, value]) => ({
    key,
    value:
      typeof value === 'string' ? { stringValue: value } : { intValue: value },
  })),
});

const batch = (records: ReadonlyArray<ReturnType<typeof wireRecord>>) =>
  JSON.stringify({ resourceLogs: [{ scopeLogs: [{ logRecords: records }] }] });

const withTeam = (
  record: ReturnType<typeof wireRecord>,
  teamId: string,
): ReturnType<typeof wireRecord> => ({
  ...record,
  attributes: [
    ...record.attributes,
    { key: 'team_id', value: { stringValue: teamId } },
  ],
});

const REQUEST_FAILED = wireRecord('Request to the server failed', 'Warn', [
  ['error_code', 'transport'],
]);

const LOCK_REFUSED = wireRecord('Editing lock refused', 'Warn', []);

const CONNECTION_RESTORED = wireRecord('Editor connection restored', 'Info', [
  ['duration_ms', 1200],
  ['attempt_count', 2],
]);

const ANSWER_SAVE_FAILED = wireRecord('Answer save failed', 'Error', [
  ['stage_index', 2],
  ['interface_type', 'NameGenerator'],
  ['error_code', 'transport'],
  ['attempt_count', 3],
]);

const principal = {
  kind: 'user' as const,
  userId: USER,
  email: Redacted.make(SECRET),
  emailVerified: true,
  name: Redacted.make('Jane Doe'),
  locale: null,
  sessionId: 'auth-session',
};

const signedIn = (lookups: string[] = []) =>
  AuthServiceStub({
    getSession: () => Effect.succeed(Option.some(principal)),
    getMembership: (userId, teamId) =>
      Effect.sync(() => {
        lookups.push(`getMembership:${teamId}`);
        return userId === USER && teamId === MEMBER_TEAM
          ? Option.some({ role: 'member' })
          : Option.none();
      }),
    listMemberships: (userId) =>
      Effect.sync(() => {
        lookups.push('listMemberships');
        return userId === USER ? [{ teamId: MEMBER_TEAM, role: 'member' }] : [];
      }),
  });

const SignedIn = signedIn();

const SignedOut = AuthServiceStub();

const OpenLimiter = RateLimiter.layer.pipe(
  Layer.provide(RateLimitStore.layerAbsent),
);

const recordingLimiter = (charged: string[]): Layer.Layer<RateLimiter> =>
  Layer.succeed(RateLimiter, {
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

type Post = {
  readonly path: string;
  readonly body: string;
  readonly headers?: Readonly<Record<string, string>>;
};

type Options = {
  readonly destination?: Destination;
  readonly telemetry?: boolean;
  readonly logLevel?: LogLevel.LogLevel;
  readonly auth?: Layer.Layer<AuthService>;
  readonly limiter?: Layer.Layer<RateLimiter>;
  readonly database?: Context.Context<Database>;
};

const serveAndPost = (posts: ReadonlyArray<Post>, options: Options = {}) =>
  Effect.gen(function* () {
    const destination = options.destination ?? DESTINATIONS[1]!;
    const sent: Sent[] = [];
    const environment = Layer.succeed(Environment, {
      ...env,
      telemetry: options.telemetry ?? true,
      telemetryEndpoint: destination.endpoint,
      telemetryHeaders: undefined,
      logLevel: options.logLevel ?? 'Info',
    });
    const statuses = yield* Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(
          HttpRouter.serve(BrowserLogRoutes, {
            disableLogger: true,
            disableListenLog: true,
          }).pipe(
            Layer.provide(ServerTelemetryLive),
            Layer.provideMerge(
              NodeHttpServer.layer(createServer, {
                port: 0,
                host: '127.0.0.1',
              }),
            ),
            Layer.provide(options.auth ?? SignedIn),
            Layer.provide(options.limiter ?? OpenLimiter),
            Layer.provide(
              options.database === undefined
                ? DatabaseAbsent
                : Layer.succeedContext(options.database),
            ),
            Layer.provideMerge(ObservabilityLive('serve')),
            Layer.provide(environment),
          ),
        );
        yield* Context.get(context, InstallationIdentity).record(INSTALLATION);
        const address = Context.get(context, HttpServer.HttpServer).address;
        if (NetAddress.isUnixPathAddress(address)) {
          return yield* Effect.die(new Error('expected a TCP listener'));
        }
        const answered: number[] = [];
        for (const post of posts) {
          const headers = {
            'content-type': 'application/json',
            'origin': ORIGIN,
            ...post.headers,
          };
          const response = yield* Effect.promise(() =>
            fetch(`http://127.0.0.1:${address.port}${post.path}`, {
              method: 'POST',
              headers,
              body: post.body,
            }),
          );
          yield* Effect.promise(() => response.text());
          answered.push(response.status);
        }
        yield* Effect.sleep('1500 millis');
        return answered;
      }),
    ).pipe(Effect.provideService(FetchHttpClient.Fetch, recordingFetch(sent)));
    return {
      statuses,
      sent,
      forwarded: forwardedFrom(destination, sent),
      everything: sent
        .filter((request) => request.url === destination.logsUrl)
        .map((request) => request.body)
        .join('\n'),
    };
  });

const researcher = (
  records: ReadonlyArray<ReturnType<typeof wireRecord>>,
  headers: Readonly<Record<string, string>> = {},
): Post => ({
  path: BROWSER_LOG_PATHS.researcher,
  body: batch(records),
  headers,
});

describe.each(DESTINATIONS)(
  'researcher logs forwarded to $name',
  (destination) => {
    it.live(
      'forwards a catalogued record as studio-web with its team and installation',
      () =>
        Effect.gen(function* () {
          const { statuses, forwarded, sent } = yield* serveAndPost(
            [researcher([withTeam(REQUEST_FAILED, MEMBER_TEAM)])],
            { destination },
          );
          expect(statuses).toEqual([204]);
          expect(forwarded).toEqual([
            {
              message: 'Request to the server failed',
              level: 'Warn',
              attributes: {
                error_code: 'transport',
                surface: 'researcher',
                team_id: MEMBER_TEAM,
              },
              resource: expect.objectContaining({
                'service.name': 'studio-web',
                'studio.installation_id': INSTALLATION,
              }),
            },
          ]);
          const delivery = sent.find(
            (request) => request.url === destination.logsUrl,
          );
          if (destination.name === 'posthog') {
            expect(delivery?.headers.get('authorization')).toBe(
              `Bearer ${POSTHOG_API_KEY}`,
            );
          }
        }),
    );
  },
);

describe('researcher logs', () => {
  it.live(
    'keeps each record’s own team, and no team the researcher does not belong to',
    () =>
      Effect.gen(function* () {
        const { forwarded } = yield* serveAndPost([
          researcher([
            withTeam(LOCK_REFUSED, MEMBER_TEAM),
            withTeam(LOCK_REFUSED, OTHER_TEAM),
            LOCK_REFUSED,
          ]),
        ]);
        expect(forwarded.map((record) => record.attributes)).toEqual([
          { surface: 'researcher', team_id: MEMBER_TEAM },
          { surface: 'researcher' },
          { surface: 'researcher' },
        ]);
      }),
  );

  it.live(
    'asks for the researcher’s teams once, and not at all for claims on records it discards',
    () =>
      Effect.gen(function* () {
        const lookups: string[] = [];
        const discarded = Array.from({ length: 50 }, (_, index) =>
          withTeam(
            wireRecord('Not a catalogued message', 'Warn', []),
            `team-${index}`,
          ),
        );
        const { statuses, forwarded } = yield* serveAndPost(
          [
            researcher(discarded),
            researcher([
              withTeam(LOCK_REFUSED, MEMBER_TEAM),
              withTeam(LOCK_REFUSED, OTHER_TEAM),
              withTeam(LOCK_REFUSED, 'team-three'),
            ]),
          ],
          { auth: signedIn(lookups) },
        );
        expect(statuses).toEqual([204, 204]);
        expect(lookups).toEqual(['listMemberships']);
        expect(forwarded.map((record) => record.attributes.team_id)).toEqual([
          MEMBER_TEAM,
          undefined,
          undefined,
        ]);
      }),
  );

  it.live(
    'drops a record that is not catalogued or carries anything else, and forwards the rest',
    () =>
      Effect.gen(function* () {
        const { statuses, forwarded, everything } = yield* serveAndPost([
          researcher([
            wireRecord(`Could not save ${SECRET}`, 'Warn', []),
            wireRecord('Request to the server failed', 'Warn', [
              ['error_code', 'transport'],
              ['email', SECRET],
            ]),
            wireRecord('Request to the server failed', 'Warn', [
              ['error_code', SECRET],
            ]),
            wireRecord('Request to the server failed', 'Error', [
              ['error_code', 'transport'],
            ]),
            LOCK_REFUSED,
          ]),
        ]);
        expect(statuses).toEqual([204]);
        expect(forwarded.map((record) => record.message)).toEqual([
          'Editing lock refused',
        ]);
        expect(everything).not.toContain('jane.doe');
      }),
  );

  it.live('does not send a record below the configured level', () =>
    Effect.gen(function* () {
      const { forwarded } = yield* serveAndPost(
        [researcher([CONNECTION_RESTORED, LOCK_REFUSED])],
        { logLevel: 'Warn' },
      );
      expect(forwarded.map((record) => record.message)).toEqual([
        'Editing lock refused',
      ]);
    }),
  );

  it.live(
    'sends nothing while telemetry is off, but still charges the limit and bounds the body',
    () =>
      Effect.gen(function* () {
        const charged: string[] = [];
        const { statuses, sent } = yield* serveAndPost(
          [
            researcher([REQUEST_FAILED]),
            {
              path: BROWSER_LOG_PATHS.researcher,
              body: batch([REQUEST_FAILED]).padEnd(
                MAX_BROWSER_LOG_BODY_BYTES + 1,
                ' ',
              ),
            },
          ],
          { telemetry: false, limiter: recordingLimiter(charged) },
        );
        expect(statuses).toEqual([204, 413]);
        expect(sent).toEqual([]);
        expect(charged).toEqual(['researcher_log', 'researcher_log']);
      }),
  );

  it.live('refuses a caller who is not signed in', () =>
    Effect.gen(function* () {
      const { statuses, forwarded } = yield* serveAndPost(
        [researcher([REQUEST_FAILED])],
        { auth: SignedOut },
      );
      expect(statuses).toEqual([401]);
      expect(forwarded).toEqual([]);
    }),
  );

  it.live('refuses a cross-origin request', () =>
    Effect.gen(function* () {
      const { statuses, forwarded } = yield* serveAndPost([
        researcher([REQUEST_FAILED], { origin: 'https://evil.example' }),
      ]);
      expect(statuses).toEqual([403]);
      expect(forwarded).toEqual([]);
    }),
  );

  it.live('refuses a body over the bound, declared or streamed', () =>
    Effect.gen(function* () {
      const oversized = batch([REQUEST_FAILED]).padEnd(
        MAX_BROWSER_LOG_BODY_BYTES + 1,
        ' ',
      );
      const { statuses, forwarded } = yield* serveAndPost([
        { path: BROWSER_LOG_PATHS.researcher, body: oversized },
      ]);
      expect(statuses).toEqual([413]);
      expect(forwarded).toEqual([]);
    }),
  );

  it('answers a streamed body over the bound, with no declared length, with 413', async () => {
    const { handler, dispose } = HttpRouter.toWebHandler(
      BrowserLogRoutes.pipe(
        Layer.provide(SignedIn),
        Layer.provide(OpenLimiter),
        Layer.provide(DatabaseAbsent),
        Layer.provideMerge(ObservabilityLive('serve')),
        Layer.provide(
          Layer.succeed(Environment, {
            ...env,
            telemetry: true,
            telemetryEndpoint: COLLECTOR,
            telemetryHeaders: undefined,
          }),
        ),
        Layer.provide(HttpServer.layerServices),
      ),
      { disableLogger: true },
    );
    try {
      const chunk = new TextEncoder().encode(' '.repeat(4096));
      let sent = 0;
      const response = await handler(
        new Request(new URL(BROWSER_LOG_PATHS.researcher, ORIGIN), {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'origin': ORIGIN },
          duplex: 'half',
          body: new ReadableStream<Uint8Array>({
            pull: (controller) => {
              if (sent > MAX_BROWSER_LOG_BODY_BYTES) {
                controller.close();
                return;
              }
              sent += chunk.byteLength;
              controller.enqueue(chunk);
            },
          }),
        }),
      );
      expect(response.status).toBe(413);
    } finally {
      await dispose();
    }
  });

  it.live('refuses a time outside the unsigned 64-bit range', () =>
    Effect.gen(function* () {
      const { statuses, forwarded } = yield* serveAndPost([
        researcher([
          { ...REQUEST_FAILED, timeUnixNano: '18446744073709551616' },
        ]),
        researcher([
          { ...REQUEST_FAILED, timeUnixNano: '18446744073709551615' },
        ]),
      ]);
      expect(statuses).toEqual([400, 204]);
      expect(forwarded).toHaveLength(1);
    }),
  );
});

describe.skipIf(!testDb)('participant logs', () => {
  layer(TestDatabaseLive, { excludeTestServices: true })('', (withDb) => {
    const participantPost = (
      token: string,
      records: ReadonlyArray<ReturnType<typeof wireRecord>>,
    ): Post => ({
      path: BROWSER_LOG_PATHS.participant,
      body: batch(records),
      headers: { [PARTICIPANT_SESSION_HEADER]: token },
    });

    const session = Effect.gen(function* () {
      const fixture = yield* seedInterviewFixture();
      const sessionId = yield* insertSession(fixture);
      const token = yield* tokenFor(fixture, sessionId);
      return { fixture, token: Redacted.value(token) };
    });

    withDb.effect(
      'forwards a catalogued record with the session’s team and no researcher',
      () =>
        Effect.gen(function* () {
          const { fixture, token } = yield* session;
          const database = yield* Effect.context<Database>();
          const charged: string[] = [];
          const { statuses, forwarded } = yield* serveAndPost(
            [participantPost(token, [ANSWER_SAVE_FAILED])],
            {
              auth: SignedOut,
              database,
              limiter: recordingLimiter(charged),
            },
          );
          expect(statuses).toEqual([204]);
          expect(charged).toEqual(['participant_log']);
          expect(forwarded).toEqual([
            {
              message: 'Answer save failed',
              level: 'Error',
              attributes: {
                stage_index: 2,
                interface_type: 'NameGenerator',
                error_code: 'transport',
                attempt_count: 3,
                surface: 'participant',
                team_id: fixture.teamId,
              },
              resource: expect.objectContaining({
                'service.name': 'studio-web',
                'studio.installation_id': INSTALLATION,
              }),
            },
          ]);
        }).pipe(Effect.orDie),
    );

    withDb.effect(
      'refuses the whole batch when one record is not catalogued, carries an extra attribute, or holds free text',
      () =>
        Effect.gen(function* () {
          const { token } = yield* session;
          const database = yield* Effect.context<Database>();
          const { statuses, forwarded, everything } = yield* serveAndPost(
            [
              participantPost(token, [
                ANSWER_SAVE_FAILED,
                wireRecord(`Participant typed ${SECRET}`, 'Error', []),
              ]),
              participantPost(token, [
                ANSWER_SAVE_FAILED,
                wireRecord('Stage failed to render', 'Error', [
                  ['stage_index', 1],
                  ['interface_type', 'Sociogram'],
                  ['answer', SECRET],
                ]),
              ]),
              participantPost(token, [
                wireRecord('Asset failed to load', 'Error', [
                  ['stage_index', 1],
                  ['interface_type', 'Sociogram'],
                  ['error_code', SECRET],
                ]),
              ]),
              participantPost(token, [
                wireRecord('Stage failed to render', 'Error', [
                  ['stage_index', 1],
                  ['interface_type', SECRET],
                ]),
              ]),
              participantPost(token, [
                withTeam(ANSWER_SAVE_FAILED, 'a-team-the-page-claims'),
              ]),
            ],
            { auth: SignedOut, database },
          );
          expect(statuses).toEqual([400, 400, 400, 400, 400]);
          expect(forwarded).toEqual([]);
          expect(everything).not.toContain('jane.doe');
        }).pipe(Effect.orDie),
    );

    withDb.effect('refuses a request without a valid participant session', () =>
      Effect.gen(function* () {
        const database = yield* Effect.context<Database>();
        const { statuses, forwarded } = yield* serveAndPost(
          [
            {
              path: BROWSER_LOG_PATHS.participant,
              body: batch([ANSWER_SAVE_FAILED]),
            },
            participantPost('not-a-session-token', [ANSWER_SAVE_FAILED]),
          ],
          { auth: SignedIn, database },
        );
        expect(statuses).toEqual([401, 401]);
        expect(forwarded).toEqual([]);
      }).pipe(Effect.orDie),
    );

    withDb.effect(
      'sends nothing while telemetry is off, and still bounds the body',
      () =>
        Effect.gen(function* () {
          const { token } = yield* session;
          const database = yield* Effect.context<Database>();
          const { statuses, sent } = yield* serveAndPost(
            [
              participantPost(token, [ANSWER_SAVE_FAILED]),
              {
                ...participantPost(token, [ANSWER_SAVE_FAILED]),
                body: batch([ANSWER_SAVE_FAILED]).padEnd(
                  MAX_BROWSER_LOG_BODY_BYTES + 1,
                  ' ',
                ),
              },
            ],
            { auth: SignedOut, database, telemetry: false },
          );
          expect(statuses).toEqual([204, 413]);
          expect(sent).toEqual([]);
        }).pipe(Effect.orDie),
    );
  });
});
