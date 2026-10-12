import {
  type Cause,
  type Fiber,
  type Layer,
  type LogLevel,
  Logger,
  References,
} from 'effect';

const text = (message: unknown): string =>
  Array.isArray(message) ? message.map(String).join(' ') : String(message);

export type LoggedRecord = {
  readonly level: LogLevel.LogLevel;
  readonly message: string;
  readonly annotations: Readonly<Record<string, unknown>>;
  readonly cause: Cause.Cause<unknown>;
};

const recordOf = (options: {
  readonly logLevel: LogLevel.LogLevel;
  readonly message: unknown;
  readonly cause: Cause.Cause<unknown>;
  readonly fiber: Fiber.Fiber<unknown, unknown>;
}): LoggedRecord => ({
  level: options.logLevel,
  message: text(options.message),
  annotations: options.fiber.getRef(References.CurrentLogAnnotations),
  cause: options.cause,
});

export function collectLogs(): {
  messages: string[];
  records: LoggedRecord[];
  layer: Layer.Layer<never>;
} {
  const messages: string[] = [];
  const records: LoggedRecord[] = [];
  return {
    messages,
    records,
    layer: Logger.layer([
      Logger.make((options) => {
        messages.push(text(options.message));
        records.push(recordOf(options));
      }),
    ]),
  };
}

export type LoggedLine = {
  readonly level: LogLevel.LogLevel;
  readonly message: string;
};

export function collectLeveledLogs(): {
  lines: LoggedLine[];
  records: LoggedRecord[];
  layer: Layer.Layer<never>;
} {
  const lines: LoggedLine[] = [];
  const records: LoggedRecord[] = [];
  return {
    lines,
    records,
    layer: Logger.layer([
      Logger.make<unknown, void>((options) => {
        lines.push({ level: options.logLevel, message: text(options.message) });
        records.push(recordOf(options));
      }),
    ]),
  };
}
