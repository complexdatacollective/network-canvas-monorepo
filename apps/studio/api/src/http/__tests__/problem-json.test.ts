import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/http';

import { ProblemJson } from '../middleware/problem-json.ts';
import { RequestIdLive } from '../middleware/request-id.ts';

const Routes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add(
      'GET',
      '/ok',
      HttpServerResponse.jsonUnsafe({ served: true }),
    );
    yield* router.add(
      'GET',
      '/boom',
      Effect.die(new Error('the handler exploded')),
    );
    yield* router.add(
      'GET',
      '/gone',
      HttpServerResponse.jsonUnsafe(
        { title: 'This protocol is not here', status: 404 },
        { status: 404, contentType: 'application/problem+json' },
      ),
    );
    yield* router.add(
      'GET',
      '/challenge',
      HttpServerResponse.empty({
        status: 401,
        headers: { 'www-authenticate': 'Bearer realm="studio"' },
      }),
    );
  }),
);

function composed() {
  return HttpRouter.toWebHandler(
    Routes.pipe(
      Layer.provideMerge(RequestIdLive.pipe(Layer.provideMerge(ProblemJson))),
    ),
    { disableLogger: true },
  );
}

function withoutProblemJson() {
  return HttpRouter.toWebHandler(
    Routes.pipe(Layer.provideMerge(RequestIdLive)),
    {
      disableLogger: true,
    },
  );
}

function get(
  handler: (request: Request) => Promise<Response>,
  path: string,
): Promise<Response> {
  return handler(new Request(new URL(path, 'http://studio.test')));
}

describe('an empty refusal', () => {
  it('leaves as problem JSON when nothing matched', async () => {
    const { handler, dispose } = composed();
    try {
      const response = await get(handler, '/nothing-here');
      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toContain(
        'application/problem+json',
      );
      expect(await response.json()).toEqual({
        title: 'Not Found',
        status: 404,
      });
    } finally {
      await dispose();
    }
  });

  it('is what the router answers on its own without this middleware', async () => {
    const { handler, dispose } = withoutProblemJson();
    try {
      const response = await get(handler, '/nothing-here');
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
      expect(response.headers.get('Content-Type')).toBeNull();
    } finally {
      await dispose();
    }
  });

  it('names a 500 for a handler that died', async () => {
    const { handler, dispose } = composed();
    try {
      const response = await get(handler, '/boom');
      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toContain(
        'application/problem+json',
      );
      expect(await response.json()).toEqual({
        title: 'Internal Server Error',
        status: 500,
      });
    } finally {
      await dispose();
    }
  });
});

describe('an empty refusal with headers', () => {
  it('keeps the headers it came with', async () => {
    const { handler, dispose } = composed();
    try {
      const response = await get(handler, '/challenge');
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe(
        'Bearer realm="studio"',
      );
      expect(await response.json()).toEqual({
        title: 'Unauthorized',
        status: 401,
      });
    } finally {
      await dispose();
    }
  });
});

describe('a body a handler chose', () => {
  it('is left alone even when it is a refusal', async () => {
    const { handler, dispose } = composed();
    try {
      const response = await get(handler, '/gone');
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        title: 'This protocol is not here',
        status: 404,
      });
    } finally {
      await dispose();
    }
  });

  it('is left alone when it succeeded', async () => {
    const { handler, dispose } = composed();
    try {
      const response = await get(handler, '/ok');
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ served: true });
    } finally {
      await dispose();
    }
  });
});

describe('the request id', () => {
  it('is on every response, and is a different one per request', async () => {
    const { handler, dispose } = composed();
    try {
      const served = await get(handler, '/ok');
      const refused = await get(handler, '/nothing-here');
      const first = served.headers.get('x-request-id');
      const second = refused.headers.get('x-request-id');
      expect(first).toMatch(/^[0-9a-f-]{36}$/);
      expect(second).toMatch(/^[0-9a-f-]{36}$/);
      expect(first).not.toBe(second);
    } finally {
      await dispose();
    }
  });
});
