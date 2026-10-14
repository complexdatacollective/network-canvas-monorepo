import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { Context, Effect, Layer, Predicate, Redacted, Schema } from 'effect';
import { FetchHttpClient, HttpRouter, HttpServer } from 'effect/http';
import * as NetAddress from 'effect/net/NetAddress';
import { afterAll, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { PARTICIPANT_SESSION_HEADER } from '@codaco/studio-contract/middleware/session';
import { RPC_PATH } from '@codaco/studio-contract/rpc/studio';
import { BROWSER_LOG_PATHS } from '@codaco/studio-contract/schema/browser-logs';
import { AnalyticsDeliveryJobSchema } from '@codaco/studio-sync/jobs';

import { createStudio } from '../app.ts';
import { type AuthService } from '../auth/service.ts';
import { Database } from '../db/client.ts';
import { TenantScope, unsafeMakeTeamAccess } from '../db/tenant.ts';
import { Environment, readEnv, type StudioEnv } from '../env.ts';
import { MaintenanceTriggers } from '../http/middleware/maintenance.ts';
import { Routes } from '../http/router.ts';
import { mintSessionToken } from '../interview/token.ts';
import { analyticsDelivery } from '../jobs/handlers/analytics-delivery.ts';
import { Analytics, POSTHOG_INGESTION_HOST } from '../platform/analytics.ts';
import { ErrorReporter } from '../platform/error-reporter.ts';
import { ServerTelemetryLive } from '../platform/http-server.ts';
import { InstallationIdentity } from '../platform/installation-identity.ts';
import { RuntimeMetricsLive } from '../platform/runtime-metrics.ts';
import { ObservabilityLive } from '../platform/tracing.ts';
import { WebSocketDrain } from '../platform/ws-drain.ts';
import { Doorbell } from '../protocol-builder/doorbell.ts';
import { baseProtocol } from '../protocol/__tests__/helpers.ts';
import { createProtocol, publishDraft } from '../protocol/store.ts';
import {
  TELEMETRY_EXCLUSIONS,
  type TelemetryExclusion,
} from '../secrets/exclusion.ts';
import { SecretsCipher } from '../secrets/services.ts';
import { liveAuthService } from './support/auth.ts';
import {
  insertTeam,
  openTestDatabase,
  ownerAffected,
  ownerRows,
  TestDatabase,
  type TestDatabaseRuntime,
  testDb,
  uniqueTeamId,
} from './support/database.ts';
import { studioServices } from './support/services.ts';

const baseEnv = readEnv();

const COLLECTOR = 'http://collector.test';

const tag = randomUUID().slice(0, 8);

const SEEDED = {
  researcherEmail: `excluded-researcher-${tag}@example.org`,
  researcherName: `ExcludedResearcherName${tag}`,
  researcherPassword: `excluded-password-${tag}-long-enough`,
  inviteeEmail: `excluded-invitee-${tag}@example.org`,
  teamName: `ExcludedTeamName${tag}`,
  studyName: `ExcludedStudyName${tag}`,
  createdStudyName: `ExcludedCreatedStudy${tag}`,
  protocolName: `ExcludedProtocolName${tag}`,
  promptText: `ExcludedPromptText${tag}`,
  stageLabel: `ExcludedStageLabel${tag}`,
  assetKey: `excluded-asset-key-${tag}`,
  participantCode: `ExcludedCode${tag}`,
  participantEmail: `excluded-participant-${tag}@example.net`,
  participantName: `ExcludedParticipantName${tag}`,
  participantAnswer: `ExcludedAnswer${tag}`,
  egoAnswer: `ExcludedEgoAnswer${tag}`,
  forgedLogText: `ExcludedForgedLog${tag}`,
  forwardedAddress: '203.0.113.77',
  urlValue: `ExcludedUrlValue${tag}`,
  refererValue: `ExcludedReferer${tag}`,
  userAgent: `ExcludedAgent${tag}/1.0`,
  databaseErrorValue: `ExcludedDatabaseValue${tag}`,
};

type Destination = {
  readonly name: 'posthog' | 'otlp';
  readonly endpoint: string | undefined;
};

const DESTINATIONS: ReadonlyArray<Destination> = [
  { name: 'posthog', endpoint: undefined },
  { name: 'otlp', endpoint: COLLECTOR },
];

type Sent = {
  readonly url: string;
  readonly headers: string;
  readonly body: string;
};

const recordingFetch =
  (sent: Sent[]): typeof globalThis.fetch =>
  async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const body = await new Response(init?.body ?? null).text();
    sent.push({
      url,
      headers: JSON.stringify([...new Headers(init?.headers).entries()]),
      body,
    });
    return new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

type Channel =
  | 'log records'
  | 'forwarded browser logs'
  | 'spans'
  | 'metrics'
  | 'error reports'
  | 'analytics events';

const channelsOf = (
  request: Sent,
): ReadonlyArray<Channel | `unexpected ${string}`> => {
  const path = new URL(request.url).pathname;
  if (path.endsWith('/v1/traces')) return ['spans'];
  if (path.endsWith('/v1/metrics')) return ['metrics'];
  if (path.endsWith('/v1/logs')) {
    if (request.body.includes('"studio-web"')) {
      return ['forwarded browser logs'];
    }
    return request.body.includes('An unexpected failure was reported')
      ? ['log records', 'error reports']
      : ['log records'];
  }
  if (request.url === `${POSTHOG_INGESTION_HOST}/batch/`) {
    return request.body.includes('"$exception"')
      ? ['error reports']
      : ['analytics events'];
  }
  return [`unexpected ${request.url}`];
};

const Json = Schema.fromJsonString(Schema.Unknown);
const parseJson = Schema.decodeUnknownSync(Json);

const field = (value: unknown, key: string): unknown =>
  Predicate.isObject(value) && Predicate.hasProperty(value, key)
    ? value[key]
    : undefined;

const queryTexts = (sent: ReadonlyArray<Sent>): string[] =>
  sent
    .filter((request) => channelsOf(request).includes('spans'))
    .flatMap((request) => {
      const texts: string[] = [];
      const visit = (value: unknown): void => {
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        if (!Predicate.isObject(value)) return;
        if (field(value, 'key') === 'db.query.text') {
          const text = field(field(value, 'value'), 'stringValue');
          if (Predicate.isString(text)) texts.push(text);
        }
        Object.values(value).forEach(visit);
      };
      visit(parseJson(request.body));
      return texts;
    });

const exclusionProtocol = (): CurrentProtocol => {
  const protocol = baseProtocol();
  const [nameGenerator, ...rest] = protocol.stages;
  return {
    ...protocol,
    name: SEEDED.protocolName,
    stages: [
      {
        ...nameGenerator,
        label: SEEDED.stageLabel,
        prompts: [{ id: 'prompt1', text: SEEDED.promptText }],
      },
      ...rest,
    ],
    assetManifest: {
      mapKey: {
        id: 'mapKey',
        name: 'Map token',
        type: 'apikey',
        value: SEEDED.assetKey,
      },
    },
  } as unknown as CurrentProtocol;
};

type Fixture = {
  readonly teamId: string;
  readonly studyId: string;
  readonly linkToken: string;
};

const seedStudy = Effect.gen(function* () {
  const harness = yield* TestDatabase;
  const cipher = yield* SecretsCipher;
  const teamId = uniqueTeamId('exclusion');
  yield* insertTeam(teamId);
  const { protocolId, versionId } = yield* TenantScope.open(
    unsafeMakeTeamAccess(teamId, 'owner'),
    Effect.gen(function* () {
      const created = yield* createProtocol(teamId, cipher, {
        protocol: exclusionProtocol(),
      });
      const published = yield* publishDraft(teamId, {
        draftId: created.draftId,
        label: 'v1',
      });
      if (published.status !== 'published') {
        return yield* Effect.die(new Error('the fixture protocol is invalid'));
      }
      return {
        protocolId: created.protocolId,
        versionId: published.versionId,
      };
    }),
  );
  const studyId = randomUUID();
  const waveId = randomUUID();
  const participantId = randomUUID();
  const link = mintSessionToken(teamId);
  const { sql } = harness.owner;
  yield* harness.onOwner(
    Effect.gen(function* () {
      yield* sql`update teams set name = ${SEEDED.teamName} where id = ${teamId}`;
      yield* sql`insert into studies
                   (id, team_id, name, protocol_id, participation_mode,
                    state, went_live_at)
                 values (${studyId}, ${teamId}, ${SEEDED.studyName},
                         ${protocolId}, 'managed', 'live', now())`;
      yield* sql`insert into study_waves
                   (id, study_id, team_id, wave_number, protocol_version_id)
                 values (${waveId}, ${studyId}, ${teamId}, 1, ${versionId})`;
      yield* sql`insert into participants
                   (id, study_id, team_id, participant_code, email, name)
                 values (${participantId}, ${studyId}, ${teamId},
                         ${SEEDED.participantCode}, ${SEEDED.participantEmail},
                         ${SEEDED.participantName})`;
      yield* sql`insert into interview_links
                   (id, study_id, team_id, wave_id, participant_id, kind,
                    token_hash)
                 values (${randomUUID()}, ${studyId}, ${teamId}, ${waveId},
                         ${participantId}, 'participant', ${link.secretHash})`;
    }),
  );
  const fixture: Fixture = {
    teamId,
    studyId,
    linkToken: Redacted.value(link.token),
  };
  return fixture;
});

class Researchers extends Context.Service<
  Researchers,
  AuthService['Service']
>()('@studio/test/telemetry-exclusion/Researchers') {}

const serving = (database: TestDatabaseRuntime, env: StudioEnv) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const analytics = yield* Analytics;
      const services = Context.add(database.services, Analytics, analytics);
      const auth = liveAuthService(env, services);
      const studio = createStudio(env, { auth, services });
      return Layer.mergeAll(
        Layer.succeed(Researchers, auth),
        WebSocketDrain.layerShutdown.pipe(
          Layer.provideMerge(
            HttpRouter.serve(Routes(studio, studio.checks), {
              disableLogger: true,
              disableListenLog: true,
            }).pipe(Layer.provide(ServerTelemetryLive)),
          ),
          Layer.provideMerge(WebSocketDrain.layer),
          Layer.provideMerge(
            NodeHttpServer.layer(createServer, { port: 0, host: '127.0.0.1' }),
          ),
          Layer.provide(Doorbell.layerMemory),
          Layer.provide(MaintenanceTriggers.layerOpen),
          Layer.provide(studioServices(studio)),
        ),
      );
    }),
  ).pipe(
    Layer.provideMerge(Analytics.layerPostHog),
    Layer.provide(RuntimeMetricsLive),
    Layer.provideMerge(ObservabilityLive('serve')),
    Layer.provideMerge(Layer.succeed(Environment, env)),
  );

type Secrets = {
  readonly cookie: string;
  readonly sessionToken: string;
};

const SuccessExit = Schema.Struct({
  _tag: Schema.Literal('Exit'),
  exit: Schema.Struct({
    _tag: Schema.Literal('Success'),
    value: Schema.Unknown,
  }),
});

const decodeSuccess = Schema.decodeUnknownOption(SuccessExit);

const scenario = (
  database: TestDatabaseRuntime,
  fixture: Fixture,
  installationId: string,
) =>
  Effect.gen(function* () {
    const identity = yield* InstallationIdentity;
    yield* identity.record(installationId);
    const address = (yield* HttpServer.HttpServer).address;
    if (NetAddress.isUnixPathAddress(address)) {
      return yield* Effect.die(new Error('expected a TCP listener'));
    }
    const origin = `http://127.0.0.1:${address.port}`;
    const browserOrigin = new URL(baseEnv.auth?.baseUrl ?? origin).origin;
    const auth = yield* Researchers;

    const signedUp = yield* auth.signUpEmail({
      name: Redacted.make(SEEDED.researcherName),
      email: Redacted.make(SEEDED.researcherEmail),
      password: Redacted.make(SEEDED.researcherPassword),
    });
    if (signedUp.kind !== 'created') {
      return yield* Effect.die(new Error(`sign-up ended ${signedUp.kind}`));
    }
    const accountId = signedUp.session.userId;
    yield* Effect.promise(() =>
      database.run(
        ownerAffected(
          `INSERT INTO team_members (id, team_id, user_id, role)
           VALUES ($1, $2, $3, 'owner')`,
          [randomUUID(), fixture.teamId, accountId],
        ),
      ),
    );
    const cookie = signedUp.session.setCookies
      .map((setCookie) => setCookie.split(';')[0])
      .join('; ');

    const sourceHeaders = {
      'x-forwarded-for': SEEDED.forwardedAddress,
      'referer': `${browserOrigin}/teams/${SEEDED.refererValue}`,
      'user-agent': SEEDED.userAgent,
    };

    let rpcId = 0;
    const rpc = (
      rpcTag: string,
      payload: unknown,
      headers: Readonly<Record<string, string>>,
    ) =>
      Effect.promise(async () => {
        rpcId += 1;
        const response = await fetch(
          `${origin}${RPC_PATH}?ref=${SEEDED.urlValue}`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/ndjson',
              'sec-fetch-site': 'same-origin',
              ...sourceHeaders,
              ...headers,
            },
            body: `${JSON.stringify({ _tag: 'Request', id: String(rpcId), tag: rpcTag, payload: payload ?? null, headers: [] })}\n`,
          },
        );
        const text = await response.text();
        const lines = text
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => parseJson(line));
        for (const line of lines) {
          const success = decodeSuccess(line);
          if (success._tag === 'Some') return success.value.exit.value;
        }
        throw new Error(`${rpcTag} did not succeed: ${text}`);
      });

    const asResearcher = { cookie };
    yield* rpc('me', undefined, asResearcher);
    yield* rpc('studies.list', { teamId: fixture.teamId }, asResearcher);
    yield* rpc('studies.get', { studyId: fixture.studyId }, asResearcher);
    yield* rpc('protocols.list', { teamId: fixture.teamId }, asResearcher);
    yield* rpc(
      'studies.create',
      {
        teamId: fixture.teamId,
        studyId: randomUUID(),
        protocolId: randomUUID(),
        draftId: randomUUID(),
        name: SEEDED.createdStudyName,
      },
      asResearcher,
    );
    yield* rpc(
      'team.createInvitation',
      { teamId: fixture.teamId, email: SEEDED.inviteeEmail, role: 'member' },
      asResearcher,
    );

    const redeemed = yield* rpc(
      'participant.redeem',
      { linkToken: fixture.linkToken },
      {},
    );
    const sessionToken = field(redeemed, 'sessionToken');
    if (!Predicate.isString(sessionToken)) {
      return yield* Effect.die(new Error('redeem returned no session token'));
    }
    const asParticipant = { [PARTICIPANT_SESSION_HEADER]: sessionToken };
    const opened = yield* rpc(
      'participant.session',
      { holderId: 'exclusion-page' },
      asParticipant,
    );
    const holderEpoch = field(opened, 'holderEpoch');
    const revision = field(opened, 'revision');
    if (!Predicate.isNumber(holderEpoch) || !Predicate.isString(revision)) {
      return yield* Effect.die(new Error('the session payload was malformed'));
    }
    yield* rpc(
      'participant.sync',
      {
        holderEpoch,
        revision: (BigInt(revision) + 1n).toString(),
        stageIndex: 0,
        stageId: 'nameGenerator1',
        network: {
          nodes: [
            {
              _uid: 'node-1',
              type: 'person',
              stageId: 'nameGenerator1',
              promptIDs: ['prompt1'],
              attributes: { personName: SEEDED.participantAnswer },
            },
          ],
          edges: [],
          ego: { _uid: 'ego', attributes: { age: SEEDED.egoAnswer } },
        },
        stageMetadata: {},
      },
      asParticipant,
    );
    const pageProperties = {
      app: 'studio',
      $app_name: 'studio',
      installation_id: 'studio',
      package_version: '10.0.0',
      protocol_hash: SEEDED.protocolName,
      distinct_id: 'exclusion-page',
    };
    const usability = (event: string, properties: Record<string, unknown>) => ({
      event,
      properties: { ...pageProperties, ...properties },
      timestamp: new Date().toISOString(),
    });
    const stageEntered = usability('stage_entered', {
      stage_type: 'NameGenerator',
      stage_index: 0,
      direction: 'initial',
    });
    yield* rpc(
      'participant.analytics',
      { events: [stageEntered] },
      asParticipant,
    );
    yield* rpc(
      'participant.analytics',
      {
        events: [
          stageEntered,
          usability('interview_finished', {
            stage_count: 3,
            participant_name: SEEDED.participantName,
          }),
        ],
      },
      asParticipant,
    );
    yield* rpc(
      'participant.analytics',
      { events: [{ ...stageEntered, timestamp: SEEDED.participantCode }] },
      asParticipant,
    );
    yield* rpc(
      'participant.analytics',
      {
        events: [
          usability('stage_entered', {
            stage_type: SEEDED.participantName,
            stage_index: 0,
            direction: 'initial',
          }),
        ],
      },
      asParticipant,
    );
    yield* rpc(
      'participant.analytics',
      {
        events: [
          usability('$exception', {
            feature: 'stage-error-boundary',
            component_stack: `\n    at ${SEEDED.participantAnswer}`,
            is_offline: false,
            $exception_list: [
              {
                type: 'Error',
                value: SEEDED.participantAnswer,
                mechanism: { handled: true, synthetic: false },
              },
            ],
          }),
        ],
      },
      asParticipant,
    );

    const postLogs = (
      path: string,
      records: ReadonlyArray<unknown>,
      headers: Readonly<Record<string, string>>,
    ) =>
      Effect.promise(async () => {
        const response = await fetch(
          `${origin}${path}?ref=${SEEDED.urlValue}`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'origin': browserOrigin,
              ...sourceHeaders,
              ...headers,
            },
            body: JSON.stringify({
              resourceLogs: [{ scopeLogs: [{ logRecords: records }] }],
            }),
          },
        );
        await response.text();
        return response.status;
      });
    const wireRecord = (
      message: string,
      level: string,
      attributes: ReadonlyArray<readonly [string, string | number]>,
    ) => ({
      timeUnixNano: `${Date.now()}000000`,
      severityText: level,
      body: { stringValue: message },
      attributes: attributes.map(([key, value]) => ({
        key,
        value:
          typeof value === 'string'
            ? { stringValue: value }
            : { intValue: value },
      })),
    });
    const researcherStatus = yield* postLogs(
      BROWSER_LOG_PATHS.researcher,
      [
        wireRecord('Request to the server failed', 'Warn', [
          ['error_code', 'transport'],
          ['team_id', fixture.teamId],
        ]),
      ],
      asResearcher,
    );
    const participantStatus = yield* postLogs(
      BROWSER_LOG_PATHS.participant,
      [
        wireRecord('Answer save failed', 'Error', [
          ['stage_index', 0],
          ['interface_type', 'NameGenerator'],
          ['error_code', 'transport'],
          ['attempt_count', 3],
        ]),
      ],
      asParticipant,
    );
    const forgedStatus = yield* postLogs(
      BROWSER_LOG_PATHS.participant,
      [
        wireRecord(SEEDED.forgedLogText, 'Error', [
          ['stage_index', 0],
          ['error_code', SEEDED.participantAnswer],
        ]),
      ],
      asParticipant,
    );

    const { sql } = Context.get(database.services, Database);
    const reporter = yield* Effect.serviceOption(ErrorReporter);
    if (reporter._tag === 'None') {
      return yield* Effect.die(new Error('telemetry built no error reporter'));
    }
    yield* sql`select ${SEEDED.databaseErrorValue}::uuid as id`.pipe(
      Effect.withSpan('exclusion.unexpected-database-failure'),
      Effect.tapCause((cause) =>
        Effect.all([
          Effect.logError('An exclusion probe failed', cause),
          reporter.value.report(cause, {
            origin: 'request',
            teamId: fixture.teamId,
          }),
        ]),
      ),
      Effect.ignore,
    );

    const queued = yield* Effect.promise(() =>
      database.run(
        ownerRows<{ id: string; payload: unknown }>(
          `SELECT id, payload FROM ${database.harness.jobSchema}.jobs
            WHERE queue = 'analytics-delivery'
            ORDER BY created_at, id`,
        ),
      ),
    );
    for (const job of queued) {
      yield* analyticsDelivery({
        id: job.id,
        queue: 'analytics-delivery',
        payload: Schema.decodeUnknownSync(AnalyticsDeliveryJobSchema)(
          job.payload,
        ),
        attempt: 1,
        finalAttempt: false,
      });
    }

    const secrets: Secrets = { cookie, sessionToken };
    return {
      secrets,
      queued: queued.length,
      statuses: { researcherStatus, participantStatus, forgedStatus },
    };
  });

const excludedValues = (
  fixture: Fixture,
  secrets: Secrets,
): Record<TelemetryExclusion, ReadonlyArray<string>> => ({
  'participant-information': [
    SEEDED.participantCode,
    SEEDED.participantEmail,
    SEEDED.participantName,
  ],
  'participant-responses': [SEEDED.participantAnswer, SEEDED.egoAnswer],
  'asset-keys': [SEEDED.assetKey],
  'secrets': [
    fixture.linkToken,
    secrets.sessionToken,
    SEEDED.researcherPassword,
    ...secrets.cookie
      .split('; ')
      .map((pair) => pair.slice(pair.indexOf('=') + 1))
      .map((value) => decodeURIComponent(value))
      .flatMap((value) => value.split('.'))
      .filter((part) => part.length >= 16),
  ],
  'researcher-identity': [
    SEEDED.researcherEmail,
    SEEDED.researcherName,
    SEEDED.inviteeEmail,
  ],
  'team-study-and-protocol-names': [
    SEEDED.teamName,
    SEEDED.studyName,
    SEEDED.createdStudyName,
    SEEDED.protocolName,
  ],
  'protocol-content': [SEEDED.promptText, SEEDED.stageLabel],
  'ip-addresses': [SEEDED.forwardedAddress],
  'request-urls-and-headers': [
    SEEDED.urlValue,
    SEEDED.refererValue,
    SEEDED.userAgent,
  ],
  'free-text-error-messages': [SEEDED.databaseErrorValue, SEEDED.forgedLogText],
});

describe.skipIf(!testDb || !baseEnv.auth || !baseEnv.secrets)(
  'what Studio sends out of the process',
  () => {
    const opened: TestDatabaseRuntime[] = [];

    afterAll(async () => {
      await Promise.all(opened.map((database) => database.dispose()));
    });

    it.each(DESTINATIONS)(
      'carries no excluded value to $name, and does carry Level 1 values',
      async (destination) => {
        const database = await openTestDatabase();
        opened.push(database);
        const fixture = await database.run(seedStudy);
        const installationId = randomUUID();
        await database.run(
          ownerAffected(
            `INSERT INTO installation (id, installation_id) VALUES (1, $1)
             ON CONFLICT (id) DO UPDATE SET installation_id = EXCLUDED.installation_id`,
            [installationId],
          ),
        );
        const env: StudioEnv = {
          ...baseEnv,
          telemetry: true,
          telemetryEndpoint: destination.endpoint,
          telemetryHeaders: undefined,
          logLevel: 'Debug',
        };
        const sent: Sent[] = [];
        const outcome = await Effect.runPromise(
          scenario(database, fixture, installationId).pipe(
            Effect.provide(serving(database, env)),
            Effect.provideService(FetchHttpClient.Fetch, recordingFetch(sent)),
          ),
        );

        expect(outcome.statuses).toEqual({
          researcherStatus: 204,
          participantStatus: 204,
          forgedStatus: 400,
        });
        expect(outcome.queued).toBeGreaterThan(0);

        const channels = new Set(sent.flatMap(channelsOf));
        expect([...channels].sort()).toEqual(
          [
            'analytics events',
            'error reports',
            'forwarded browser logs',
            'log records',
            'metrics',
            'spans',
          ].sort(),
        );

        const excluded = excludedValues(fixture, outcome.secrets);
        expect(Object.keys(excluded).sort()).toEqual(
          [...TELEMETRY_EXCLUSIONS].sort(),
        );
        const leaks = Object.entries(excluded).flatMap(([kind, values]) => {
          expect(values.length, kind).toBeGreaterThan(0);
          return values.flatMap((value) =>
            sent
              .filter((request) =>
                [request.url, request.headers, request.body].some((part) =>
                  part.includes(value),
                ),
              )
              .map(
                (request) =>
                  `${kind} "${value}" in ${channelsOf(request).join(' and ')}`,
              ),
          );
        });
        expect(leaks).toEqual([]);

        const texts = queryTexts(sent);
        expect(texts.length).toBeGreaterThan(0);
        expect(texts.some((text) => text.includes('$1'))).toBe(true);

        const exported = sent.map((request) => request.body).join('\n');
        expect(exported).toContain(fixture.teamId);
        expect(exported).toContain('NameGenerator');
        expect(
          sent
            .filter((request) => request.body.includes(fixture.teamId))
            .flatMap(channelsOf),
        ).toEqual(expect.arrayContaining(['forwarded browser logs']));
        const participantEvents = sent
          .filter((request) => channelsOf(request).includes('analytics events'))
          .flatMap((request) => {
            const batch = field(parseJson(request.body), 'batch');
            return Array.isArray(batch) ? batch : [];
          })
          .filter((event) => field(event, 'event') === 'stage_entered');
        expect(participantEvents).toHaveLength(1);
        expect(field(participantEvents[0], 'properties')).toMatchObject({
          stage_type: 'NameGenerator',
          stage_index: 0,
          direction: 'initial',
        });
      },
      120_000,
    );
  },
);
