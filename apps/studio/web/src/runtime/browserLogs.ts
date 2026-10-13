import {
  Duration,
  Effect,
  Layer,
  Logger,
  ManagedRuntime,
  Predicate,
  References,
} from 'effect';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as HttpBody from 'effect/http/HttpBody';
import * as HttpClient from 'effect/http/HttpClient';
import * as HttpClientRequest from 'effect/http/HttpClientRequest';
import {
  OtlpExporter,
  OtlpLogger,
  OtlpSerialization,
} from 'effect/observability';

import {
  BROWSER_LOG_ATTRIBUTE_KEYS,
  BROWSER_LOG_PATHS,
  BROWSER_LOG_SERVICE_NAME,
  type BrowserLogSurface,
  type LogLevelName,
  MAX_BROWSER_LOG_RECORDS,
  type ParticipantLogEntry,
  type ResearcherLogEntry,
} from '@codaco/studio-contract/schema/browser-logs';

type LogsData = OtlpLogger.LogsData;
type LogRecord = NonNullable<
  LogsData['resourceLogs'][number]['scopeLogs'][number]['logRecords']
>[number];
type AnyValue = LogRecord['attributes'][number]['value'];

type Entry = ParticipantLogEntry | ResearcherLogEntry;

export type BrowserLogConfig = {
  readonly enabled: boolean;
  readonly level: LogLevelName;
  readonly credentials: RequestCredentials;
  readonly headers: () => Readonly<Record<string, string>>;
};

type Sink = {
  readonly log: (entry: Entry) => void;
  readonly dispose: () => Promise<void>;
};

type SurfaceState = {
  readonly pending: Entry[];
  sink: Sink | 'off' | undefined;
};

const MAX_PENDING_ENTRIES = 20;

const KEPT_ATTRIBUTES: ReadonlySet<string> = new Set(
  BROWSER_LOG_ATTRIBUTE_KEYS,
);

const wireValue = (value: AnyValue) => {
  if (Predicate.isString(value.stringValue)) {
    return { stringValue: value.stringValue };
  }
  if (Predicate.isNumber(value.intValue)) return { intValue: value.intValue };
  if (Predicate.isNumber(value.doubleValue)) {
    return { doubleValue: value.doubleValue };
  }
  if (Predicate.isBoolean(value.boolValue)) {
    return { boolValue: value.boolValue };
  }
  return undefined;
};

const wireRecord = (record: LogRecord) => ({
  timeUnixNano: String(record.timeUnixNano),
  severityText: record.severityText,
  body: { stringValue: record.body?.stringValue ?? '' },
  attributes: record.attributes.flatMap((attribute) => {
    const value = wireValue(attribute.value);
    return KEPT_ATTRIBUTES.has(attribute.key) && value !== undefined
      ? [{ key: attribute.key, value }]
      : [];
  }),
});

const browserLogsBody = (data: LogsData) => ({
  resourceLogs: [
    {
      scopeLogs: [
        {
          logRecords: data.resourceLogs.flatMap((resourceLogs) =>
            resourceLogs.scopeLogs.flatMap((scopeLogs) =>
              (scopeLogs.logRecords ?? []).map(wireRecord),
            ),
          ),
        },
      ],
    },
  ],
});

const BrowserSerialization = Layer.succeed(
  OtlpSerialization.OtlpSerialization,
  {
    traces: (data) => HttpBody.jsonUnsafe(data),
    metrics: (data) => HttpBody.jsonUnsafe(data),
    logs: (data) => HttpBody.jsonUnsafe(browserLogsBody(data)),
  },
);

const transport = (config: BrowserLogConfig) =>
  Layer.effect(HttpClient.HttpClient)(
    Effect.map(HttpClient.HttpClient, (client) =>
      HttpClient.mapRequest(client, (request) =>
        HttpClientRequest.setHeaders(request, config.headers()),
      ),
    ),
  ).pipe(
    Layer.provide(
      FetchHttpClient.layer.pipe(
        Layer.provide(
          Layer.succeed(FetchHttpClient.RequestInit)({
            credentials: config.credentials,
          }),
        ),
      ),
    ),
  );

const sinkLayer = (surface: BrowserLogSurface, config: BrowserLogConfig) =>
  Logger.layer(
    [
      OtlpLogger.make({
        url: new URL(
          BROWSER_LOG_PATHS[surface],
          window.location.origin,
        ).toString(),
        resource: { serviceName: BROWSER_LOG_SERVICE_NAME },
        maxBatchSize: MAX_BROWSER_LOG_RECORDS,
        exportInterval: Duration.seconds(1),
        shutdownTimeout: Duration.seconds(2),
        excludeLogSpans: true,
      }),
    ],
    { mergeWithExisting: false },
  ).pipe(
    Layer.provideMerge(OtlpExporter.layerFlusher),
    Layer.provide(BrowserSerialization),
    Layer.provide(transport(config)),
    Layer.merge(Layer.succeed(References.MinimumLogLevel, config.level)),
  );

const makeSink = (
  surface: BrowserLogSurface,
  config: BrowserLogConfig,
): Sink => {
  const runtime = ManagedRuntime.make(sinkLayer(surface, config));
  return {
    log: (entry) => {
      runtime.runFork(
        Effect.logWithLevel(entry.level)(entry.message).pipe(
          Effect.annotateLogs(entry.attributes),
        ),
      );
    },
    dispose: () => runtime.dispose(),
  };
};

const surfaces: Record<BrowserLogSurface, SurfaceState> = {
  researcher: { pending: [], sink: undefined },
  participant: { pending: [], sink: undefined },
};

const record = (surface: BrowserLogSurface, entry: Entry): void => {
  const state = surfaces[surface];
  if (state.sink === 'off') return;
  if (state.sink === undefined) {
    if (state.pending.length < MAX_PENDING_ENTRIES) state.pending.push(entry);
    return;
  }
  state.sink.log(entry);
};

export const logResearcher = (entry: ResearcherLogEntry): void =>
  record('researcher', entry);

export const logParticipant = (entry: ParticipantLogEntry): void =>
  record('participant', entry);

export function startBrowserLogs(
  surface: BrowserLogSurface,
  config: BrowserLogConfig,
): () => void {
  const state = surfaces[surface];
  const sink = config.enabled ? makeSink(surface, config) : 'off';
  state.sink = sink;
  const pending = state.pending.splice(0);
  if (sink !== 'off') for (const entry of pending) sink.log(entry);
  return () => {
    if (state.sink === sink) state.sink = undefined;
    if (sink !== 'off') void sink.dispose();
  };
}
