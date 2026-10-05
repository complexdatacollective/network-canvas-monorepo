import { type Layer, Logger } from 'effect';

export const LoggerLive: Layer.Layer<never> = Logger.layer([
  Logger.consoleJson,
]);
