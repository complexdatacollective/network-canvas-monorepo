import { createServer } from 'node:http';

import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer, Tracer } from 'effect';
import { HttpRouter, HttpServer, HttpServerResponse } from 'effect/http';
import * as NetAddress from 'effect/net/NetAddress';

import { PARTICIPANT_SESSION_HEADER } from '@codaco/studio-contract/middleware/session';

import { RedactedHeadersLive } from '../http-server.ts';

const requestHeaderAttributes = (
  redaction: Layer.Layer<never>,
  headers: Record<string, string>,
) =>
  Effect.gen(function* () {
    const spans: Tracer.NativeSpan[] = [];
    const recording = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });

    const Probe = HttpRouter.add(
      'GET',
      '/probe',
      HttpServerResponse.text('ok'),
    );
    const Served = HttpRouter.serve(Probe, {
      disableLogger: true,
      disableListenLog: true,
    }).pipe(
      Layer.provide(redaction),
      Layer.provideMerge(
        NodeHttpServer.layer(createServer, { port: 0, host: '127.0.0.1' }),
      ),
      Layer.provide(Layer.succeed(Tracer.Tracer, recording)),
    );

    yield* Effect.gen(function* () {
      const server = yield* HttpServer.HttpServer;
      const address = server.address;
      if (NetAddress.isUnixPathAddress(address)) {
        return yield* Effect.die(new Error('expected a TCP listener'));
      }
      const { port } = address;
      yield* Effect.promise(() =>
        fetch(`http://127.0.0.1:${port}/probe`, { headers }),
      );
    }).pipe(Effect.provide(Served));

    return new Map(
      spans.flatMap((span) =>
        [...span.attributes].filter(([key]) =>
          key.startsWith('http.request.header.'),
        ),
      ),
    );
  });

describe('the request headers a trace records', () => {
  const headers = {
    [PARTICIPANT_SESSION_HEADER]: 'team.secret-participant-token',
    'x-probe': 'visible',
  };

  it.live('never hold a participant session token', () =>
    Effect.gen(function* () {
      const attributes = yield* requestHeaderAttributes(
        RedactedHeadersLive,
        headers,
      );
      expect(
        attributes.get(`http.request.header.${PARTICIPANT_SESSION_HEADER}`),
      ).toBe('<redacted>');
      expect(attributes.get('http.request.header.x-probe')).toBe('visible');
    }),
  );

  it.live('would hold it without the redaction', () =>
    Effect.gen(function* () {
      const attributes = yield* requestHeaderAttributes(Layer.empty, headers);
      expect(
        attributes.get(`http.request.header.${PARTICIPANT_SESSION_HEADER}`),
      ).toBe('team.secret-participant-token');
    }),
  );
});
