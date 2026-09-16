import { createServer } from 'node:http';

import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import type * as NodeServices from '@effect/platform-node/NodeServices';
import { Effect, Layer } from 'effect';
import type { Etag, HttpPlatform, HttpServer } from 'effect/unstable/http';
import type { ServeError } from 'effect/unstable/http/HttpServerError';

import { Environment } from '../env.ts';

// The listeners the two long-running processes bind. Studio's own
// `node:http` server rather than a framework's: everything above it — the
// router, the Hono residue, the WebSocket upgrade — is Effect's, and the only
// thing this decides is the address and how long a stop waits.
//
// Neither layer logs: the programs print their own boot line, which names the
// build as well as the address, and two lines for one event in a container log
// is one too many.

/**
 * How long a stop waits for in-flight requests before it closes the listener
 * on them. A container's own stop window is longer than this, so a deploy
 * replaces a process that finished what it had rather than one that dropped
 * it.
 */
const GRACEFUL_SHUTDOWN_TIMEOUT = '10 seconds';

type StudioHttpServer = Layer.Layer<
  | HttpServer.HttpServer
  | NodeServices.NodeServices
  | HttpPlatform.HttpPlatform
  | Etag.Generator,
  ServeError,
  Environment
>;

/** The web process's listener, on the configured port and interface. */
export const HttpServerLive: StudioHttpServer = Layer.unwrap(
  Effect.map(Environment, (env) =>
    NodeHttpServer.layer(createServer, {
      port: env.port,
      host: env.host,
      gracefulShutdownTimeout: GRACEFUL_SHUTDOWN_TIMEOUT,
    }),
  ),
);

/**
 * The worker's health listener. `127.0.0.1` is written here rather than taken
 * from `env.host` on purpose: the worker routes no traffic, so this listener
 * exists for the container healthcheck and must not be reachable from
 * anywhere else. `src/__tests__/worker-entrypoint.test.ts` proves it is not
 * published by connecting to every external address this machine answers on.
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
