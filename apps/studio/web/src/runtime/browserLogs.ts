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
  BROWSER_LOG_TEAM_ATTRIBUTE,
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

type Context = Readonly<Record<string, string>>;

type Sink = {
  readonly log: (entry: Entry, context: Context) => void;
  readonly flush: () => void;
  readonly dispose: () => Promise<void>;
};

type Queued = { readonly entry: Entry; readonly context: Context };

type HandleState =
  | { readonly kind: 'pending'; readonly queue: Queued[] }
  | { readonly kind: 'open'; readonly sink: Sink }
  | { readonly kind: 'closed' };

export type BrowserLogHandle<E extends Entry> = {
  readonly log: (entry: E, context?: Context) => void;
  readonly configure: (config: BrowserLogConfig) => void;
  readonly close: () => void;
  readonly isClosed: () => boolean;
};

const MAX_PENDING_ENTRIES = 20;

const KEEPALIVE_BATCH_RECORDS = Math.min(50, MAX_BROWSER_LOG_RECORDS);

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
            keepalive: true,
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
        maxBatchSize: KEEPALIVE_BATCH_RECORDS,
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
    log: (entry, context) => {
      runtime.runFork(
        Effect.logWithLevel(entry.level)(entry.message).pipe(
          Effect.annotateLogs({ ...entry.attributes, ...context }),
        ),
      );
    },
    flush: () => {
      runtime.runFork(OtlpExporter.Flusher.use((flusher) => flusher.flush));
    },
    dispose: () => runtime.dispose(),
  };
};

type PageEvents = Pick<Window, 'addEventListener' | 'removeEventListener'>;

type DocumentState = PageEvents & {
  readonly visibilityState: DocumentVisibilityState;
};

export const createBrowserLogHandle = <E extends Entry>(
  surface: BrowserLogSurface,
  page: PageEvents = window,
  doc: DocumentState = document,
): BrowserLogHandle<E> => {
  let state: HandleState = { kind: 'pending', queue: [] };
  let leaving = doc.visibilityState === 'hidden';
  const flush = () => {
    if (state.kind === 'open') state.sink.flush();
  };
  const onPageHide = () => {
    leaving = true;
    flush();
  };
  const onPageShow = () => {
    leaving = false;
  };
  const onVisibilityChange = () => {
    leaving = doc.visibilityState === 'hidden';
    if (leaving) flush();
  };
  const listen = () => {
    page.addEventListener('pagehide', onPageHide);
    page.addEventListener('pageshow', onPageShow);
    doc.addEventListener('visibilitychange', onVisibilityChange);
  };
  const unlisten = () => {
    page.removeEventListener('pagehide', onPageHide);
    page.removeEventListener('pageshow', onPageShow);
    doc.removeEventListener('visibilitychange', onVisibilityChange);
  };
  return {
    log: (entry, context = {}) => {
      if (state.kind === 'open') {
        state.sink.log(entry, context);
        if (leaving) state.sink.flush();
      } else if (
        state.kind === 'pending' &&
        state.queue.length < MAX_PENDING_ENTRIES
      ) {
        state.queue.push({ entry, context });
      }
    },
    configure: (config) => {
      if (state.kind !== 'pending') return;
      const { queue } = state;
      if (!config.enabled) {
        state = { kind: 'closed' };
        return;
      }
      const sink = makeSink(surface, config);
      state = { kind: 'open', sink };
      listen();
      for (const queued of queue) sink.log(queued.entry, queued.context);
      if (leaving) sink.flush();
    },
    close: () => {
      unlisten();
      if (state.kind === 'open') void state.sink.dispose();
      state = { kind: 'closed' };
    },
    isClosed: () => state.kind === 'closed',
  };
};

let researcherTeam: string | undefined;

export const setResearcherLogTeam = (teamId: string | undefined): void => {
  researcherTeam = teamId;
};

let researcherLogs = createBrowserLogHandle<ResearcherLogEntry>('researcher');

export const logResearcher = (entry: ResearcherLogEntry): void =>
  researcherLogs.log(
    entry,
    researcherTeam === undefined
      ? {}
      : { [BROWSER_LOG_TEAM_ATTRIBUTE]: researcherTeam },
  );

export function startResearcherLogs(config: BrowserLogConfig): () => void {
  if (researcherLogs.isClosed()) {
    researcherLogs = createBrowserLogHandle<ResearcherLogEntry>('researcher');
  }
  const handle = researcherLogs;
  handle.configure(config);
  return handle.close;
}
