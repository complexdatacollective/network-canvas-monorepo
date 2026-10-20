import { Clock, Context, Duration, Effect, Layer } from 'effect';
import type { HttpClient } from 'effect/http';
import {
  OtlpExporter,
  type OtlpLogger,
  OtlpResource,
  OtlpSerialization,
} from 'effect/observability';

import {
  BROWSER_LOG_SERVICE_NAME,
  type BrowserLogEntry,
  type BrowserLogSurface,
} from '@codaco/studio-contract/schema/browser-logs';

type ResourceLogs = OtlpLogger.LogsData['resourceLogs'][number];
type LogRecord = NonNullable<
  ResourceLogs['scopeLogs'][number]['logRecords']
>[number];
type KeyValue = OtlpResource.KeyValue;
type SeverityNumber = NonNullable<LogRecord['severityNumber']>;

export type ForwardedBrowserLog = {
  readonly entry: BrowserLogEntry;
  readonly timeUnixNano: string;
  readonly teamId: string | undefined;
};

const SEVERITY_NUMBERS: Readonly<
  Record<BrowserLogEntry['level'], SeverityNumber>
> = {
  Info: 9,
  Warn: 13,
  Error: 17,
};

const attributeValue = (
  value: string | number | boolean,
): KeyValue['value'] => {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { boolValue: value };
  return Number.isInteger(value) ? { intValue: value } : { doubleValue: value };
};

const recordOf = (
  log: ForwardedBrowserLog,
  surface: BrowserLogSurface,
  observedTimeUnixNano: string,
): LogRecord => ({
  timeUnixNano: log.timeUnixNano,
  observedTimeUnixNano,
  severityNumber: SEVERITY_NUMBERS[log.entry.level],
  severityText: log.entry.level,
  body: { stringValue: log.entry.message },
  attributes: [
    ...Object.entries(log.entry.attributes).map(([key, value]) => ({
      key,
      value: attributeValue(value),
    })),
    { key: 'surface', value: { stringValue: surface } },
    ...(log.teamId === undefined
      ? []
      : [{ key: 'team_id', value: { stringValue: log.teamId } }]),
  ],
  droppedAttributesCount: 0,
});

export class BrowserLogs extends Context.Service<
  BrowserLogs,
  {
    readonly forward: (
      logs: ReadonlyArray<ForwardedBrowserLog>,
      surface: BrowserLogSurface,
    ) => Effect.Effect<void>;
  }
>()('@studio/platform/BrowserLogs') {
  static readonly layer = (options: {
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
  }): Layer.Layer<
    BrowserLogs,
    never,
    | OtlpSerialization.OtlpSerialization
    | OtlpExporter.Flusher
    | HttpClient.HttpClient
  > =>
    Layer.effect(
      BrowserLogs,
      Effect.gen(function* () {
        const serialization = yield* OtlpSerialization.OtlpSerialization;
        const resource = OtlpResource.make({
          serviceName: BROWSER_LOG_SERVICE_NAME,
        });
        const exporter = yield* OtlpExporter.make({
          label: 'StudioWebLogs',
          url: options.url,
          headers: options.headers,
          maxBatchSize: 1000,
          exportInterval: Duration.seconds(1),
          shutdownTimeout: Duration.seconds(3),
          body: (logRecords: Array<LogRecord>) => [
            serialization.logs({
              resourceLogs: [
                {
                  resource,
                  scopeLogs: [
                    { scope: { name: BROWSER_LOG_SERVICE_NAME }, logRecords },
                  ],
                },
              ],
            }),
            Effect.void,
          ],
        });
        return BrowserLogs.of({
          forward: (logs, surface) =>
            Effect.map(Clock.currentTimeNanos, (now) => {
              for (const log of logs) {
                exporter.push(recordOf(log, surface, now.toString()));
              }
            }),
        });
      }),
    );
}
