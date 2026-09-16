import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';

import { ProblemJson } from '../middleware/problem-json.ts';
import { RequestIdLive } from '../middleware/request-id.ts';

// What a caller reads when this server refuses (#1248). The Hono app has
// always answered problem JSON; the Effect router answers an unmatched route
// or an unhandled defect with a status and an empty body, so the two halves of
// one surface would otherwise disagree about what a refusal looks like.

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

/** The composed stack: problem JSON outermost, then the request id. */
function composed() {
  return HttpRouter.toWebHandler(
    Routes.pipe(
      Layer.provideMerge(RequestIdLive.pipe(Layer.provideMerge(ProblemJson))),
    ),
    { disableLogger: true },
  );
}

/** The same stack with the rewrite taken out — the mutation, run for real. */
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
    // The mutation, run rather than described: remove ProblemJson from the
    // chain and the 404 above carries no body and no content type at all, so
    // the case above cannot pass by accident.
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
    // A defect is the case an operator reads in a log and a client reads on
    // the wire; answering it with an empty body tells the client nothing at
    // all about what happened.
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
    // Mutation: build the problem body as a fresh response without carrying
    // `response.headers` over → the challenge header is gone, and a 401 that
    // named how to authenticate no longer does.
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
    // Mutation: rewrite every response with a status >= 400 rather than the
    // empty ones, and this 404's own title is replaced by 'Not Found' —
    // which is how better-auth's `{ message }` errors would be destroyed too.
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
    // Mutation: mint the id once at layer build rather than per request, and
    // the two ids below are equal — which would make one id name every
    // request in the log.
    const { handler, dispose } = composed();
    try {
      const served = await get(handler, '/ok');
      const refused = await get(handler, '/nothing-here');
      const first = served.headers.get('x-request-id');
      const second = refused.headers.get('x-request-id');
      // Present on the refusal too: the response an operator has to trace is
      // the one that failed, and that one is synthesised by the router rather
      // than returned by a handler.
      expect(first).toMatch(/^[0-9a-f-]{36}$/);
      expect(second).toMatch(/^[0-9a-f-]{36}$/);
      expect(first).not.toBe(second);
    } finally {
      await dispose();
    }
  });
});
