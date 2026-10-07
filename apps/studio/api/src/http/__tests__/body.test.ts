import { Effect, Layer } from 'effect';
import * as HttpRouter from 'effect/http/HttpRouter';
import * as HttpServer from 'effect/http/HttpServer';
import * as HttpServerRequest from 'effect/http/HttpServerRequest';
import * as HttpServerResponse from 'effect/http/HttpServerResponse';
import { describe, expect, it } from 'vitest';

import { MAX_UNARY_BODY_BYTES } from '@codaco/studio-contract/limits';

import { boundedBody, UnaryBodyLimit } from '../body.ts';

async function probedBound(limit?: number): Promise<string> {
  const route = HttpRouter.add(
    'POST',
    '/probe',
    Effect.map(HttpServerRequest.MaxBodySize, (bound) =>
      HttpServerResponse.text(String(bound)),
    ),
  ).pipe(Layer.provide(boundedBody.layer));
  const configured =
    limit === undefined
      ? route
      : route.pipe(Layer.provide(Layer.succeed(UnaryBodyLimit)(limit)));
  const { handler, dispose } = HttpRouter.toWebHandler(
    configured.pipe(Layer.provide(HttpServer.layerServices)),
    { disableLogger: true },
  );
  try {
    const response = await handler(
      new Request('http://studio.test/probe', { method: 'POST' }),
    );
    return await response.text();
  } finally {
    await dispose();
  }
}

describe('the unary body bound', () => {
  it('is the unary bound the contract names', async () => {
    expect(await probedBound()).toBe(String(MAX_UNARY_BODY_BYTES));
  });

  it('is the limit a deployment provides', async () => {
    expect(await probedBound(64 * 1024)).toBe(String(64 * 1024));
  });
});
