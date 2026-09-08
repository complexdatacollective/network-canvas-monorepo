import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';

import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { WebSocketServer } from 'ws';

import type { PrincipalVariables } from '../auth/principal.ts';
import {
  operationalLogger,
  requestContext,
  type OperationalLogger,
  type RequestObservation,
  UUID,
} from './logger.ts';
import { trustedPeer } from './proxy.ts';
import { requestMethod, requestRoute } from './routes.ts';

const upgrades = new WeakMap<
  IncomingMessage,
  { requestId: string; complete(status: number): void }
>();

function transport(c: Context) {
  const bindings: unknown = c.env;
  const incoming =
    bindings && typeof bindings === 'object' && 'incoming' in bindings
      ? bindings.incoming
      : undefined;
  const outgoing =
    bindings && typeof bindings === 'object' && 'outgoing' in bindings
      ? bindings.outgoing
      : undefined;
  return {
    incoming: incoming instanceof IncomingMessage ? incoming : undefined,
    outgoing: outgoing instanceof ServerResponse ? outgoing : undefined,
  };
}

function requestHasTrustedPeer(
  c: Context,
  proxies: readonly string[],
): boolean {
  if (!transport(c).incoming) return false;
  return trustedPeer(getConnInfo(c).remote.address, proxies);
}

/** Log the actual upgrade result, after ws validates its handshake. */
export function observeWebSocketServer(server: WebSocketServer): void {
  server.on('headers', (_headers, request) =>
    upgrades.get(request)?.complete(101),
  );
  server.on('wsClientError', (_error, socket, request) => {
    const observation = upgrades.get(request);
    observation?.complete(400);
    // The ws default includes its error reason in the response. A fixed
    // refusal also gives malformed handshakes the same correlation header.
    if (socket.writable)
      socket.end(
        `HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n${observation ? `X-Request-Id: ${observation.requestId}\r\n` : ''}\r\n`,
      );
  });
}

export function observeRequests(options: {
  trustedProxies: readonly string[];
  logger?: OperationalLogger;
  record(observation: RequestObservation): void;
}) {
  return createMiddleware<PrincipalVariables>(async (c, next) => {
    const supplied = c.req.header('x-request-id');
    const requestId =
      supplied &&
      UUID.test(supplied) &&
      requestHasTrustedPeer(c, options.trustedProxies)
        ? supplied.toLowerCase()
        : randomUUID();
    const context = {
      requestId,
      logger: options.logger ?? operationalLogger,
      teamId: undefined as string | undefined,
    };
    c.set('requestId', requestId);
    const started = performance.now();
    const { incoming, outgoing } = transport(c);
    let completed = false;
    const complete = (status: number) => {
      if (completed) return;
      completed = true;
      if (incoming) upgrades.delete(incoming);
      const observation = {
        requestId,
        teamId: context.teamId,
        route: requestRoute(c.req.path),
        method: requestMethod(c.req.method),
        status,
        durationMs: Math.max(0, performance.now() - started),
      };
      context.logger.request(observation);
      options.record(observation);
    };
    if (outgoing) {
      outgoing.once('finish', () => complete(outgoing.statusCode));
      outgoing.once('close', () =>
        complete(outgoing.writableFinished ? outgoing.statusCode : 499),
      );
    }
    return requestContext.run(context, async () => {
      c.header('X-Request-Id', requestId);
      await next();
      // A downstream Response must not replace the established correlation.
      c.header('X-Request-Id', requestId);
      if (c.res.body) {
        const reader = c.res.body.getReader();
        const body = new ReadableStream<Uint8Array>(
          {
            async pull(controller) {
              try {
                const chunk = await reader.read();
                if (chunk.done) controller.close();
                else controller.enqueue(chunk.value);
              } catch {
                context.logger.diagnostic(
                  'STUDIO_RESPONSE_STREAM_FAILED',
                  context,
                );
                if (outgoing) {
                  // Hono's adapter prints stream exceptions and appends their
                  // messages to the response. End the transport without handing
                  // it the exception or letting a partial artifact look complete.
                  complete(500);
                  outgoing.destroy();
                  controller.close();
                } else {
                  controller.error(new Error('STUDIO_RESPONSE_STREAM_FAILED'));
                }
              }
            },
            async cancel() {
              // Cancellation reasons can contain application/transport details.
              try {
                await reader.cancel();
              } catch {
                /* No raw error crosses the adapter. */
              }
            },
          },
          { highWaterMark: 0 },
        );
        c.res = new Response(body, c.res);
      }
      if (outgoing) return;
      if (
        incoming &&
        c.req.path === '/ws' &&
        c.res.status === 200 &&
        c.req.header('upgrade')?.toLowerCase() === 'websocket'
      ) {
        upgrades.set(incoming, { requestId, complete });
        incoming.socket.once('close', () => complete(499));
      } else {
        complete(c.res.status);
      }
    });
  });
}
