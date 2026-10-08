import { createServer } from 'node:http';

import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import type * as NodeServices from '@effect/platform-node/NodeServices';
import { Effect, Layer } from 'effect';
import { Headers, HttpMiddleware } from 'effect/http';
import type { Etag, HttpPlatform, HttpServer } from 'effect/http';
import type { ServeError } from 'effect/http/HttpServerError';

import { MAX_SOCKET_FRAME_BYTES } from '@codaco/studio-contract/limits';
import { PARTICIPANT_SESSION_HEADER } from '@codaco/studio-contract/middleware/session';

import { Environment } from '../env.ts';

/** How long the listener waits for accepted requests to finish once it stops. */
export const GRACEFUL_SHUTDOWN_TIMEOUT = '10 seconds';

export const RedactedHeadersLive = Layer.succeed(Headers.CurrentRedactedNames)([
  ...Headers.CurrentRedactedNames.defaultValue(),
  PARTICIPANT_SESSION_HEADER,
]);

export const ServerTelemetryLive: Layer.Layer<never> = Layer.mergeAll(
  RedactedHeadersLive,
  Layer.succeed(HttpMiddleware.TracerDisabledWhen)(() => true),
);

type StudioHttpServer = Layer.Layer<
  | HttpServer.HttpServer
  | NodeServices.NodeServices
  | HttpPlatform.HttpPlatform
  | Etag.Generator,
  ServeError,
  Environment
>;

export const HttpServerLive: StudioHttpServer = Layer.unwrap(
  Effect.map(Environment, (env) =>
    NodeHttpServer.layer(createServer, {
      port: env.port,
      host: env.host,
      gracefulShutdownTimeout: GRACEFUL_SHUTDOWN_TIMEOUT,
      websocket: { maxPayload: MAX_SOCKET_FRAME_BYTES },
    }),
  ),
);

/**
 * `127.0.0.1` rather than `env.host` on purpose: this listener exists for the
 * container healthcheck and must not be reachable from anywhere else.
 */
export const WorkerHealthServerLive: StudioHttpServer = Layer.unwrap(
  Effect.map(Environment, (env) =>
    NodeHttpServer.layer(createServer, {
      port: env.workerHealthPort,
      host: '127.0.0.1',
      gracefulShutdownTimeout: GRACEFUL_SHUTDOWN_TIMEOUT,
    }),
  ),
);
