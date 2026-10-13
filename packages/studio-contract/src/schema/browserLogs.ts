import { LogLevel, Schema } from 'effect';

import { UsageInterfaceType } from '@codaco/studio-sync/jobs';

import { NonNegativeInt } from './primitives.ts';

export const BROWSER_LOG_PATHS = {
  researcher: '/api/telemetry/researcher/logs',
  participant: '/api/telemetry/participant/logs',
} as const;

export const BROWSER_LOG_SURFACES = ['researcher', 'participant'] as const;
export type BrowserLogSurface = (typeof BROWSER_LOG_SURFACES)[number];

export const BROWSER_LOG_SERVICE_NAME = 'studio-web';

export const BROWSER_LOG_TEAM_ATTRIBUTE = 'team_id';

export const MAX_BROWSER_LOG_BODY_BYTES = 64 * 1024;

export const MAX_BROWSER_LOG_RECORDS = 100;

export const LogLevelName = Schema.Literals(LogLevel.values);
export type LogLevelName = typeof LogLevelName.Type;

export const FAULT_CODES = [
  'transport',
  'unauthorized',
  'forbidden',
  'not_found',
  'rate_limited',
  'maintenance',
  'conflict',
  'session_ended',
  'session_taken_over',
  'link_unavailable',
  'http_error',
  'media',
  'unknown',
] as const;

export const FaultCode = Schema.Literals(FAULT_CODES);
export type FaultCode = typeof FaultCode.Type;

const AttemptCount = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: 1000 }),
);

const DurationMs = NonNegativeInt.check(
  Schema.isLessThanOrEqualTo(7 * 24 * 60 * 60 * 1000),
);

const StageIndex = NonNegativeInt.check(Schema.isLessThanOrEqualTo(10_000));

export const BROWSER_LOG_ATTRIBUTE_KEYS = [
  'stage_index',
  'interface_type',
  'error_code',
  'attempt_count',
  'duration_ms',
  BROWSER_LOG_TEAM_ATTRIBUTE,
] as const;

const UINT64_MAX = 18446744073709551615n;

const UNSIGNED_DECIMAL = /^\d{1,20}$/;

const UnixNano = Schema.String.check(
  Schema.isPattern(UNSIGNED_DECIMAL),
  Schema.makeFilter<string>(
    (value) =>
      !UNSIGNED_DECIMAL.test(value) ||
      BigInt(value) <= UINT64_MAX ||
      'must be within the unsigned 64-bit range',
  ),
);

const StageFields = {
  stage_index: StageIndex,
  interface_type: UsageInterfaceType,
};

const entry = <
  const Message extends string,
  const Level extends 'Info' | 'Warn' | 'Error',
  const Fields extends Schema.Struct.Fields,
>(
  message: Message,
  level: Level,
  attributes: Fields,
) =>
  Schema.Struct({
    message: Schema.Literal(message),
    level: Schema.Literal(level),
    attributes: Schema.Struct(attributes),
  });

export const ParticipantSessionLoadFailed = entry(
  'Interview session failed to load',
  'Error',
  { error_code: FaultCode },
);

export const AnswerSaveFailed = entry('Answer save failed', 'Error', {
  ...StageFields,
  error_code: FaultCode,
  attempt_count: AttemptCount,
});

export const AnswerSaveRetried = entry(
  'Answer save succeeded after retrying',
  'Warn',
  { ...StageFields, attempt_count: AttemptCount },
);

export const ParticipantConnectionLost = entry(
  'Participant connection lost',
  'Warn',
  StageFields,
);

export const ParticipantConnectionRestored = entry(
  'Participant connection restored',
  'Info',
  { ...StageFields, duration_ms: DurationMs },
);

export const AssetFailedToLoad = entry('Asset failed to load', 'Error', {
  ...StageFields,
  error_code: FaultCode,
});

export const StageFailedToRender = entry(
  'Stage failed to render',
  'Error',
  StageFields,
);

export const ParticipantLogEntry = Schema.Union([
  ParticipantSessionLoadFailed,
  AnswerSaveFailed,
  AnswerSaveRetried,
  ParticipantConnectionLost,
  ParticipantConnectionRestored,
  AssetFailedToLoad,
  StageFailedToRender,
]);
export type ParticipantLogEntry = typeof ParticipantLogEntry.Type;

export const ServerRequestFailed = entry(
  'Request to the server failed',
  'Warn',
  { error_code: FaultCode },
);

export const EditorConnectionLost = entry('Editor connection lost', 'Warn', {});

export const EditorConnectionRestored = entry(
  'Editor connection restored',
  'Info',
  { duration_ms: DurationMs, attempt_count: AttemptCount },
);

export const EditingLockLost = entry('Editing lock lost', 'Warn', {});

export const EditingLockRefused = entry('Editing lock refused', 'Warn', {});

export const ScreenFailedToRender = entry('Screen failed to render', 'Error', {
  error_code: FaultCode,
});

export const UpdateCheckFailed = entry('Update check failed', 'Warn', {
  error_code: FaultCode,
});

export const ResearcherLogEntry = Schema.Union([
  ServerRequestFailed,
  EditorConnectionLost,
  EditorConnectionRestored,
  EditingLockLost,
  EditingLockRefused,
  ScreenFailedToRender,
  UpdateCheckFailed,
]);
export type ResearcherLogEntry = typeof ResearcherLogEntry.Type;

export type BrowserLogEntry = ParticipantLogEntry | ResearcherLogEntry;

const WireValue = Schema.Union([
  Schema.Struct({ stringValue: Schema.String.check(Schema.isMaxLength(200)) }),
  Schema.Struct({ intValue: Schema.Number.check(Schema.isInt()) }),
  Schema.Struct({ doubleValue: Schema.Number }),
  Schema.Struct({ boolValue: Schema.Boolean }),
]);

export const BrowserLogWireRecord = Schema.Struct({
  timeUnixNano: UnixNano,
  severityText: LogLevelName,
  body: Schema.Struct({
    stringValue: Schema.String.check(Schema.isMaxLength(200)),
  }),
  attributes: Schema.Array(
    Schema.Struct({
      key: Schema.String.check(Schema.isMaxLength(100)),
      value: WireValue,
    }),
  ).check(Schema.isMaxLength(BROWSER_LOG_ATTRIBUTE_KEYS.length)),
});
export type BrowserLogWireRecord = typeof BrowserLogWireRecord.Type;

export const BrowserLogsBody = Schema.Struct({
  resourceLogs: Schema.Array(
    Schema.Struct({
      scopeLogs: Schema.Array(
        Schema.Struct({
          logRecords: Schema.Array(BrowserLogWireRecord),
        }),
      ),
    }),
  ),
});
export type BrowserLogsBody = typeof BrowserLogsBody.Type;

export const browserLogRecords = (
  body: BrowserLogsBody,
): ReadonlyArray<BrowserLogWireRecord> =>
  body.resourceLogs.flatMap((resourceLogs) =>
    resourceLogs.scopeLogs.flatMap((scopeLogs) => scopeLogs.logRecords),
  );

type WireValue = typeof WireValue.Type;

const plainValue = (value: WireValue): string | number | boolean =>
  'stringValue' in value
    ? value.stringValue
    : 'intValue' in value
      ? value.intValue
      : 'doubleValue' in value
        ? value.doubleValue
        : value.boolValue;

export const entryCandidate = (
  record: BrowserLogWireRecord,
):
  | {
      readonly message: string;
      readonly level: LogLevelName;
      readonly attributes: Readonly<Record<string, string | number | boolean>>;
    }
  | undefined => {
  const keys = record.attributes.map((attribute) => attribute.key);
  if (new Set(keys).size !== keys.length) return undefined;
  return {
    message: record.body.stringValue,
    level: record.severityText,
    attributes: Object.fromEntries(
      record.attributes.map((attribute) => [
        attribute.key,
        plainValue(attribute.value),
      ]),
    ),
  };
};

const STRICT = { onExcessProperty: 'error' } as const;

export const decodeParticipantLogEntry = Schema.decodeUnknownOption(
  ParticipantLogEntry,
  STRICT,
);

export const decodeResearcherLogEntry = Schema.decodeUnknownOption(
  ResearcherLogEntry,
  STRICT,
);
