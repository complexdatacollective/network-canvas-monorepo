import { assert, describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { HttpRouter, HttpServer } from 'effect/unstable/http';
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiMiddleware,
  HttpApiTest,
  OpenApi,
} from 'effect/unstable/httpapi';

import { StatusApiGroup } from '../api/groups/status.ts';
import {
  API_V1_PATH,
  openApiDocument,
  ScopedToken,
  StudioApi,
} from '../api/v1.ts';
import { NotFound } from '../schema/errors.ts';
import type { InstanceStatus } from '../schema/status.ts';

// The public surface's published contract (#1248): the OpenAPI document third
// parties generate clients from, and the wire the `status` group answers on.

const document = openApiDocument();

describe('the published OpenAPI document', () => {
  it('matches the committed snapshot', () => {
    expect(document).toMatchSnapshot();
  });

  it('is OpenAPI 3.1.0', () => {
    expect(document.openapi).toBe('3.1.0');
  });

  it('names its mount as the server its relative paths resolve against', () => {
    expect(document.servers).toEqual([{ url: API_V1_PATH }]);
  });

  it('publishes GET /status and nothing else', () => {
    expect(Object.keys(document.paths)).toEqual(['/status']);
    expect(Object.keys(document.paths['/status'] ?? {})).toEqual(['get']);
    expect(document.paths['/status']?.get?.operationId).toBe('status');
  });

  it('describes status as a name and a version, and no more', () => {
    expect(Object.keys(document.components.schemas).sort()).toEqual([
      'NotFoundEncoded',
      'Status',
    ]);
    expect(document.components.schemas.Status).toEqual({
      type: 'object',
      properties: { name: { type: 'string' }, version: { type: 'string' } },
      required: ['name', 'version'],
      additionalProperties: false,
    });
  });

  it('publishes its refusal as problem+json with the status its class declares', () => {
    const responses = document.paths['/status']?.get?.responses ?? {};
    expect(Object.keys(responses).sort()).toEqual(['200', '404']);
    expect(Object.keys(responses['404']?.content ?? {})).toEqual([
      'application/problem+json',
    ]);
    expect(document.components.schemas.NotFoundEncoded).toMatchObject({
      properties: { status: { type: 'integer' } },
    });
  });

  it('publishes no security scheme while nothing uses the scoped token', () => {
    expect(document.components.securitySchemes).toEqual({});
    expect(document.security).toEqual([]);
    expect(document.paths['/status']?.get?.security).toEqual([]);
  });

  it('would publish one as soon as an endpoint used it', () => {
    // The positive control for the case above: the same group behind a
    // middleware that declares the token puts a scheme in the document, so an
    // empty `securitySchemes` means unused rather than unreadable.
    class Scoped extends HttpApiMiddleware.Service<Scoped>()(
      '@studio/test/Scoped',
      { security: { scopedToken: ScopedToken } },
    ) {}
    const secured = HttpApi.make('studio-v1-secured').add(
      StatusApiGroup.middleware(Scoped),
    );

    expect(
      Object.keys(OpenApi.fromApi(secured).components.securitySchemes),
    ).toEqual(['scopedToken']);
  });
});

const FULL_STATUS: InstanceStatus = {
  name: 'Acme Lab',
  version: '1.2.3',
  auth: {
    enabled: true,
    magicLink: true,
    emailAndPassword: true,
    socialProviders: ['google'],
  },
  deployment: { mode: 'managed', billing: false },
  setup: { required: true },
};

const answering = HttpApiBuilder.group(StudioApi, 'status', (handlers) =>
  handlers.handle('get', () => Effect.succeed(FULL_STATUS)),
);

const refusing = HttpApiBuilder.group(StudioApi, 'status', (handlers) =>
  handlers.handle('get', () => Effect.fail(new NotFound({}))),
);

describe('the status group through HttpApiTest', () => {
  it.effect('answers the typed client with the public document', () =>
    Effect.gen(function* () {
      const client = yield* HttpApiTest.groups(StudioApi, ['status']);
      const status = yield* client.status.get();
      assert.deepStrictEqual(status, { name: 'Acme Lab', version: '1.2.3' });
    }).pipe(
      Effect.provide(Layer.mergeAll(answering, HttpServer.layerServices)),
    ),
  );

  it.effect('carries a refusal to the client as its own tag', () =>
    Effect.gen(function* () {
      const client = yield* HttpApiTest.groups(StudioApi, ['status']);
      const error = yield* Effect.flip(client.status.get());
      assert.instanceOf(error, NotFound);
      assert.strictEqual(error.status, 404);
    }).pipe(Effect.provide(Layer.mergeAll(refusing, HttpServer.layerServices))),
  );
});

describe('the status group on the wire', () => {
  // The typed client decodes through the same schema, which would strip an
  // excess key or read a problem document whatever its media type. These read
  // the raw response instead, which is what a third party receives.
  const serve = async (group: typeof answering, path = '/status') => {
    const { handler, dispose } = HttpRouter.toWebHandler(
      HttpApiBuilder.layer(StudioApi).pipe(
        Layer.provide(group),
        Layer.provide(HttpServer.layerServices),
      ),
      { disableLogger: true },
    );
    try {
      const response = await handler(
        new Request(new URL(path, 'http://studio.test')),
      );
      return {
        status: response.status,
        contentType: response.headers.get('content-type'),
        body: (await response.json()) as unknown,
      };
    } finally {
      await dispose();
    }
  };

  it('encodes only what the public schema names', async () => {
    expect(await serve(answering)).toEqual({
      status: 200,
      contentType: 'application/json',
      body: { name: 'Acme Lab', version: '1.2.3' },
    });
  });

  it('answers a refusal as problem+json with the status its class declares', async () => {
    expect(await serve(refusing)).toEqual({
      status: 404,
      contentType: 'application/problem+json',
      body: {
        _tag: 'NotFound',
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
      },
    });
  });
});
