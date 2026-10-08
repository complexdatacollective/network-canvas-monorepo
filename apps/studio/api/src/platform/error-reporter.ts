import {
  Cause,
  Context,
  DateTime,
  Effect,
  ErrorReporter as EffectErrorReporter,
  FiberSet,
  Layer,
  Option,
} from 'effect';
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpServerError,
  HttpServerResponse,
} from 'effect/http';

import { POSTHOG_API_KEY, POSTHOG_APP_PROPS } from '@codaco/shared-consts';

import { STUDIO_VERSION } from '../version.ts';
import { POSTHOG_INGESTION_HOST } from './analytics.ts';
import { InstallationIdentity } from './installation-identity.ts';
import { correlationOf } from './logger.ts';
import { failureFrames, safeExceptionType } from './telemetry-export.ts';

const DELIVERY_TIMEOUT = '5 seconds';

const MAX_FRAMES = 50;

const FUNCTION_NAME = /^[\w$.<>[\] -]{1,200}$/;

const NODE_FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;

const STUDIO_APP = 'studio';

const STUDIO_APP_NAME = 'Network Canvas Studio';

export type ExceptionPlatform = 'node:javascript' | 'web:javascript';

export type ExceptionFrame = {
  readonly filename: string;
  readonly function: string;
  readonly lineno?: number | undefined;
  readonly colno?: number | undefined;
  readonly chunkId?: string | undefined;
  readonly inApp: boolean;
};

export type ReportedException = {
  readonly type: string;
  readonly platform: ExceptionPlatform;
  readonly frames: ReadonlyArray<ExceptionFrame>;
};

export type ErrorOrigin = 'request' | 'job' | 'browser';

export type ErrorContext = {
  readonly origin: ErrorOrigin;
  readonly program: string;
  readonly requestId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly queue?: string | undefined;
  readonly jobId?: string | undefined;
  readonly surface?: string | undefined;
};

export type ReportOrigin = Omit<ErrorContext, 'program'>;

const functionName = (name: string | undefined): string =>
  name !== undefined && FUNCTION_NAME.test(name) ? name : '?';

const sourcePath = (location: string): string => {
  const path = location.replace(/^file:\/\//, '');
  const vendored = path.lastIndexOf('/node_modules/');
  if (vendored !== -1) return path.slice(vendored + 1);
  const workspace = path.search(/\/(?:apps|packages)\//);
  if (workspace !== -1) return path.slice(workspace + 1);
  return path.slice(path.lastIndexOf('/') + 1);
};

const serverFrames = (frames: string): ExceptionFrame[] =>
  frames
    .split('\n')
    .flatMap((line): ExceptionFrame[] => {
      const parts = NODE_FRAME.exec(line);
      if (parts === null) return [];
      const [, name, location = '', lineno = '', colno = ''] = parts;
      const filename = sourcePath(location);
      return [
        {
          filename,
          function: functionName(name),
          lineno: Number(lineno),
          colno: Number(colno),
          inApp: !filename.startsWith('node_modules/'),
        },
      ];
    })
    .slice(0, MAX_FRAMES);

const exceptionOf = (reason: Cause.Reason<unknown>): ReportedException => {
  const [pretty] = Cause.prettyErrors(Cause.fromReasons([reason]));
  return {
    type: safeExceptionType(pretty?.name),
    platform: 'node:javascript',
    frames: pretty === undefined ? [] : serverFrames(failureFrames(pretty)),
  };
};

const contextProperties = (context: ErrorContext): Record<string, string> => {
  const properties: Record<string, string> = {
    error_origin: context.origin,
    program: context.program,
  };
  if (context.requestId !== undefined) {
    properties.request_id = context.requestId;
  }
  if (context.teamId !== undefined) properties.team_id = context.teamId;
  if (context.queue !== undefined) properties.job_queue = context.queue;
  if (context.jobId !== undefined) properties.job_id = context.jobId;
  if (context.surface !== undefined) properties.surface = context.surface;
  return properties;
};

const renderedFrames = (frames: ReadonlyArray<ExceptionFrame>): string =>
  frames
    .map((frame) => {
      const position = [frame.filename, frame.lineno, frame.colno]
        .filter((part) => part !== undefined)
        .join(':');
      return `    at ${frame.function} (${position})`;
    })
    .join('\n');

const installationDistinctId = (
  installationId: Option.Option<string>,
): string =>
  `studio-installation:${Option.getOrElse(installationId, () => 'unidentified')}`;

type Deliver = (
  exception: ReportedException,
  context: ErrorContext,
) => Effect.Effect<void>;

export class ErrorReporter extends Context.Service<
  ErrorReporter,
  {
    readonly report: (
      cause: Cause.Cause<unknown>,
      origin: ReportOrigin,
    ) => Effect.Effect<void>;
    readonly reportException: (
      exception: ReportedException,
      origin: ReportOrigin,
    ) => Effect.Effect<void>;
  }
>()('@studio/platform/ErrorReporter') {
  static readonly make = (
    program: string,
    deliver: Deliver,
  ): ErrorReporter['Service'] =>
    ErrorReporter.of({
      report: (cause, origin) =>
        Effect.suspend(() => {
          const reason = cause.reasons.find(
            (candidate) => !Cause.isInterruptReason(candidate),
          );
          if (reason === undefined) return Effect.void;
          return deliver(exceptionOf(reason), { ...origin, program });
        }),
      reportException: (exception, origin) =>
        deliver(exception, { ...origin, program }),
    });

  static readonly layerPostHog = (
    program: string,
  ): Layer.Layer<ErrorReporter, never, InstallationIdentity> =>
    Layer.effect(
      ErrorReporter,
      Effect.gen(function* () {
        const identity = yield* InstallationIdentity;
        const client = (yield* HttpClient.HttpClient).pipe(
          HttpClient.filterStatusOk,
        );
        const deliveries = yield* FiberSet.make<void>();
        yield* Effect.addFinalizer(() =>
          FiberSet.awaitEmpty(deliveries).pipe(
            Effect.timeout(DELIVERY_TIMEOUT),
            Effect.ignore,
          ),
        );
        const send = Effect.fnUntraced(
          function* (exception: ReportedException, context: ErrorContext) {
            const installationId = identity.current();
            const timestamp = DateTime.formatIso(yield* DateTime.now);
            yield* HttpClientRequest.post(
              `${POSTHOG_INGESTION_HOST}/batch/`,
            ).pipe(
              HttpClientRequest.bodyJsonUnsafe({
                api_key: POSTHOG_API_KEY,
                batch: [
                  {
                    event: '$exception',
                    timestamp,
                    properties: {
                      ...contextProperties(context),
                      distinct_id: installationDistinctId(installationId),
                      $process_person_profile: false,
                      $geoip_disable: true,
                      $exception_level: 'error',
                      $exception_list: [
                        {
                          type: exception.type,
                          value: exception.type,
                          mechanism: {
                            type: 'generic',
                            handled: false,
                            synthetic: false,
                          },
                          stacktrace: {
                            type: 'raw',
                            frames: [...exception.frames]
                              .reverse()
                              .map((frame) => ({
                                platform: exception.platform,
                                filename: frame.filename,
                                function: frame.function,
                                in_app: frame.inApp,
                                ...(frame.lineno === undefined
                                  ? {}
                                  : { lineno: frame.lineno }),
                                ...(frame.colno === undefined
                                  ? {}
                                  : { colno: frame.colno }),
                                ...(frame.chunkId === undefined
                                  ? {}
                                  : { chunk_id: frame.chunkId }),
                              })),
                          },
                        },
                      ],
                      [POSTHOG_APP_PROPS.APP]: STUDIO_APP,
                      [POSTHOG_APP_PROPS.APP_NAME]: STUDIO_APP_NAME,
                      [POSTHOG_APP_PROPS.APP_VERSION]: STUDIO_VERSION,
                      [POSTHOG_APP_PROPS.HOST_VERSION]: STUDIO_VERSION,
                      ...Option.match(installationId, {
                        onNone: () => ({}),
                        onSome: (value) => ({
                          [POSTHOG_APP_PROPS.INSTALLATION_ID]: value,
                        }),
                      }),
                    },
                  },
                ],
              }),
              client.execute,
              Effect.flatMap((response) => response.text),
              Effect.timeout(DELIVERY_TIMEOUT),
            );
          },
          Effect.catch((error) =>
            Effect.logWarning('An error report could not be delivered').pipe(
              Effect.annotateLogs({ reason: error._tag }),
            ),
          ),
        );
        return ErrorReporter.make(program, (exception, context) =>
          Effect.asVoid(FiberSet.run(deliveries, send(exception, context))),
        );
      }),
    ).pipe(Layer.provide(FetchHttpClient.layer));

  static readonly layerOtlp = (program: string): Layer.Layer<ErrorReporter> =>
    Layer.sync(ErrorReporter, () =>
      ErrorReporter.make(program, (exception, context) =>
        Effect.logError('An unexpected failure was reported').pipe(
          Effect.annotateLogs({
            ...contextProperties(context),
            'exception.type': exception.type,
            'exception.stacktrace': renderedFrames(exception.frames),
          }),
        ),
      ),
    );
}

export const requestOrigin = (
  context: Context.Context<never>,
): ReportOrigin => {
  const correlation = correlationOf(context);
  return {
    origin: 'request',
    requestId: correlation.request_id,
    teamId: correlation.team_id,
  };
};

const unexpectedOverHttp = (
  reason: Cause.Reason<unknown>,
): Effect.Effect<boolean> => {
  if (Cause.isInterruptReason(reason)) return Effect.succeed(false);
  if (
    Cause.isDieReason(reason) &&
    HttpServerResponse.isHttpServerResponse(reason.defect)
  ) {
    return Effect.succeed(false);
  }
  return Effect.map(
    HttpServerError.causeResponse(Cause.fromReasons([reason])),
    ([response]) => response.status >= 500,
  );
};

export type RequestReport = (
  cause: Cause.Cause<unknown>,
  origin: ReportOrigin,
) => Effect.Effect<void>;

export const reportingOnce = (
  reporter: ErrorReporter['Service'],
): RequestReport => {
  const seen = new Set<Cause.Reason<unknown>>();
  return (cause, origin) =>
    Effect.suspend(() => {
      const fresh = cause.reasons.filter((reason) => !seen.has(reason));
      for (const reason of fresh) seen.add(reason);
      return fresh.length === 0
        ? Effect.void
        : reporter.report(Cause.fromReasons(fresh), origin);
    });
};

export const reportHttpFailure = (
  report: RequestReport,
  cause: Cause.Cause<unknown>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (Cause.hasInterruptsOnly(cause)) return;
    const unexpected = yield* Effect.filter(cause.reasons, unexpectedOverHttp);
    if (unexpected.length === 0) return;
    yield* report(
      Cause.fromReasons(unexpected),
      requestOrigin(Cause.annotations(cause)),
    );
  });

export const defectReporter = (
  report: RequestReport,
): EffectErrorReporter.ErrorReporter => ({
  [EffectErrorReporter.TypeId]: EffectErrorReporter.TypeId,
  report: ({ cause, fiber }) => {
    const defects = cause.reasons.filter(Cause.isDieReason);
    if (defects.length === 0) return;
    Effect.runForkWith(fiber.context)(
      report(Cause.fromReasons(defects), requestOrigin(fiber.context)),
    );
  },
});
