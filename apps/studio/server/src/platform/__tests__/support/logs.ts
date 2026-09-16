import { type Layer, type LogLevel, Logger } from 'effect';

/** What `Effect.log*` hands a logger, joined where a call passed several. */
const text = (message: unknown): string =>
  Array.isArray(message) ? message.map(String).join(' ') : String(message);

/**
 * A logger layer that keeps what was logged, for cases whose subject is the
 * diagnostic itself — the schema gate's two development warnings, the drain's
 * count of stuck connections. Reading the recorded text rather than a boolean
 * is what makes those cases fail when the wording drifts away from the one an
 * operator is told to look for.
 *
 * The record is the message alone, joined where a call passed several
 * arguments, which is what `Effect.log*` hands a logger.
 */
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

/**
 * The same record with the level beside each line, for the cases whose subject
 * is *which* level a line was written at. Nothing in a deployment sets a
 * minimum, so Effect's own default of `Info` decides what is seen at all: a
 * line written at debug is not written, and the difference between `Warn` and
 * `Error` is the difference between an operator noticing and not.
 */
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
