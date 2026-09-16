import { type Layer, Logger } from 'effect';

// One line of JSON per log record, on stdout, for every Studio process.
//
// A container's log stream is read by whatever collects it rather than by a
// person at a terminal, and Effect's default logger renders for the terminal.
// `consoleJson` renders `{"message": "...", ...}` with the level, the
// timestamp, the fiber and any annotations beside it, which is what makes a
// boot line searchable in a log store rather than only greppable.
export const LoggerLive: Layer.Layer<never> = Logger.layer([
  Logger.consoleJson,
]);
