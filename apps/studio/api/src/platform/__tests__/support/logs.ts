import { type Layer, type LogLevel, Logger } from 'effect';

const text = (message: unknown): string =>
  Array.isArray(message) ? message.map(String).join(' ') : String(message);

export function collectLogs(): {
  messages: string[];
  layer: Layer.Layer<never>;
} {
  const messages: string[] = [];
  return {
    messages,
    layer: Logger.layer([
      Logger.make(({ message }) => {
        messages.push(text(message));
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
  layer: Layer.Layer<never>;
} {
  const lines: LoggedLine[] = [];
  return {
    lines,
    layer: Logger.layer([
      Logger.make<unknown, void>(({ logLevel, message }) => {
        lines.push({ level: logLevel, message: text(message) });
      }),
    ]),
  };
}
