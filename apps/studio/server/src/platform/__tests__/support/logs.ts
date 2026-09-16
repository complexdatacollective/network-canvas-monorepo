import { type Layer, Logger } from 'effect';

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
        messages.push(
          Array.isArray(message)
            ? message.map(String).join(' ')
            : String(message),
        );
      }),
    ]),
  };
}
