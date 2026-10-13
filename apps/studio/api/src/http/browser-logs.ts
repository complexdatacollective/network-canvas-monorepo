import { Effect, Layer, LogLevel, Option, References, Schema } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import {
  BROWSER_LOG_PATHS,
  BROWSER_LOG_TEAM_ATTRIBUTE,
  type BrowserLogEntry,
  type BrowserLogWireRecord,
  BrowserLogsBody,
  browserLogRecords,
  decodeParticipantLogEntry,
  decodeResearcherLogEntry,
  entryCandidate,
  MAX_BROWSER_LOG_BODY_BYTES,
  MAX_BROWSER_LOG_RECORDS,
} from '@codaco/studio-contract/schema/browser-logs';

import { AuthService } from '../auth/service.ts';
import { Database } from '../db/client.ts';
import { Environment } from '../env.ts';
import {
  BrowserLogs,
  type ForwardedBrowserLog,
} from '../platform/browser-logs.ts';
import { enforceRateLimit } from '../rate-limit/enforce.ts';
import { RateLimiter } from '../rate-limit/limiter.ts';
import type { RateLimitScope } from '../rate-limit/scopes.ts';
import { presentedParticipant } from '../rpc/require-session.ts';
import { contentTooLarge, readBodyCapped } from './body.ts';
import { requireSameOrigin } from './middleware/origin.ts';
import { requirePrincipal } from './middleware/principal.ts';
import { tooManyRequests } from './middleware/rate-limit.ts';

const problem = (status: number, title: string) =>
  HttpServerResponse.jsonUnsafe(
    { title, status },
    { status, contentType: 'application/problem+json' },
  );

const accepted = () => HttpServerResponse.empty({ status: 204 });

const decodeBody = Schema.decodeUnknownOption(
  Schema.fromJsonString(BrowserLogsBody),
  { onExcessProperty: 'error' },
);

const utf8 = new TextDecoder();

const readRecords = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BROWSER_LOG_BODY_BYTES) {
    return yield* Effect.fail(contentTooLarge());
  }
  const bytes = yield* readBodyCapped(MAX_BROWSER_LOG_BODY_BYTES).pipe(
    Effect.mapError((failure) =>
      failure._tag === 'BodyTooLarge'
        ? contentTooLarge()
        : problem(400, 'Unreadable body'),
    ),
  );
  const body = decodeBody(utf8.decode(bytes));
  if (Option.isNone(body)) {
    return yield* Effect.fail(problem(400, 'Not a browser log batch'));
  }
  const records = browserLogRecords(body.value);
  if (records.length > MAX_BROWSER_LOG_RECORDS) {
    return yield* Effect.fail(problem(400, 'Too many log records'));
  }
  return records;
});

type Decode = (candidate: unknown) => Option.Option<BrowserLogEntry>;

type Candidate = NonNullable<ReturnType<typeof entryCandidate>>;

const decodedEntry = (
  candidate: Candidate,
  record: BrowserLogWireRecord,
  decode: Decode,
  teamId: string | undefined,
): Option.Option<ForwardedBrowserLog> =>
  Option.map(decode(candidate), (entry) => ({
    entry,
    timeUnixNano: record.timeUnixNano,
    teamId,
  }));

const withoutTeam = (
  candidate: Candidate,
): { readonly candidate: Candidate; readonly claimed: unknown } => {
  const { [BROWSER_LOG_TEAM_ATTRIBUTE]: claimed, ...attributes } =
    candidate.attributes;
  return { candidate: { ...candidate, attributes }, claimed };
};

type Services = {
  readonly forwarder: Option.Option<BrowserLogs['Service']>;
  readonly minimum: LogLevel.LogLevel;
  readonly auth: AuthService['Service'];
  readonly limiter: RateLimiter['Service'];
  readonly database: Database['Service'];
};

const limited = (services: Services, scope: RateLimitScope, subject: string) =>
  enforceRateLimit(scope, subject).pipe(
    Effect.provideService(RateLimiter, services.limiter),
    Effect.catchTag('RateLimited', (refusal) =>
      Effect.fail(tooManyRequests(refusal.retryAfterSeconds)),
    ),
  );

const forward = (
  services: Services,
  logs: ReadonlyArray<ForwardedBrowserLog>,
  surface: 'researcher' | 'participant',
): Effect.Effect<void> => {
  if (Option.isNone(services.forwarder)) return Effect.void;
  const kept = logs.filter((log) =>
    LogLevel.isGreaterThanOrEqualTo(log.entry.level, services.minimum),
  );
  return kept.length === 0
    ? Effect.void
    : services.forwarder.value.forward(kept, surface);
};

const researcherLogs = (services: Services) =>
  Effect.gen(function* () {
    const principal = yield* Principal;
    yield* limited(services, 'researcher_log', principal.userId);
    if (Option.isNone(services.forwarder)) return accepted();
    const records = yield* readRecords;
    const decoded = records.flatMap((record) => {
      const candidate = entryCandidate(record);
      if (candidate === undefined) return [];
      const split = withoutTeam(candidate);
      return Option.toArray(
        Option.map(decodeResearcherLogEntry(split.candidate), (entry) => ({
          entry,
          record,
          claimed: split.claimed,
        })),
      );
    });
    const members = decoded.some(({ claimed }) => typeof claimed === 'string')
      ? new Set(
          (yield* services.auth.listMemberships(principal.userId)).map(
            (membership) => membership.teamId,
          ),
        )
      : new Set<string>();
    const logs = decoded.map(({ entry, record, claimed }) => ({
      entry,
      timeUnixNano: record.timeUnixNano,
      teamId:
        typeof claimed === 'string' && members.has(claimed)
          ? claimed
          : undefined,
    }));
    yield* forward(services, logs, 'researcher');
    return accepted();
  }).pipe(Effect.catch((response) => Effect.succeed(response)));

const participantLogs = (services: Services) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const participant = yield* presentedParticipant(request.headers).pipe(
      Effect.provideService(Database, services.database),
    );
    if (Option.isNone(participant)) {
      return yield* Effect.fail(problem(401, 'Unauthorized'));
    }
    const { session } = participant.value;
    yield* limited(services, 'participant_log', session.sessionId);
    if (Option.isNone(services.forwarder)) return accepted();
    const records = yield* readRecords;
    const logs: ForwardedBrowserLog[] = [];
    for (const record of records) {
      const candidate = entryCandidate(record);
      const decoded =
        candidate === undefined
          ? Option.none()
          : decodedEntry(
              candidate,
              record,
              decodeParticipantLogEntry,
              session.teamId,
            );
      if (Option.isNone(decoded)) {
        return yield* Effect.fail(problem(400, 'Not a catalogued log record'));
      }
      logs.push(decoded.value);
    }
    yield* forward(services, logs, 'participant');
    return accepted();
  }).pipe(Effect.catch((response) => Effect.succeed(response)));

export const BrowserLogRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const env = yield* Environment;
    const services: Services = {
      forwarder: yield* Effect.serviceOption(BrowserLogs),
      minimum: yield* References.MinimumLogLevel,
      auth: yield* AuthService,
      limiter: yield* RateLimiter,
      database: yield* Database,
    };
    const sameOrigin =
      env.auth === undefined ? undefined : requireSameOrigin(env.auth.baseUrl);

    const researcher = HttpRouter.add(
      'POST',
      BROWSER_LOG_PATHS.researcher,
      researcherLogs(services),
    ).pipe(
      Layer.provide(
        (sameOrigin === undefined
          ? requirePrincipal
          : requirePrincipal.combine(sameOrigin)
        ).layer,
      ),
    );

    const participantRoute = HttpRouter.add(
      'POST',
      BROWSER_LOG_PATHS.participant,
      participantLogs(services),
    );
    const participant =
      sameOrigin === undefined
        ? participantRoute
        : participantRoute.pipe(Layer.provide(sameOrigin.layer));

    return Layer.mergeAll(researcher, participant);
  }),
);
