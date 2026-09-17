import { Predicate } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  Conflict,
  Forbidden,
  Maintenance,
  NotFound,
  RateLimited,
} from '@codaco/studio-contract/schema/errors';
import type { InstanceStatus } from '@codaco/studio-contract/schema/status';

import { installFetchStub, problemResponse } from '../../test/fetchStub.ts';
import {
  isConflict,
  isForbidden,
  isNotFound,
  refusalOf,
  retryAfterSeconds,
} from '../errors.ts';
import { rpcCall } from '../rpc.ts';

// Scope E: the plane the rpc parser cannot see.
//
// A handler's refusal is a 200 with a `Failure` envelope. A refusal made before
// the request reaches a handler is a problem+json document with a real status,
// and `layerProtocolHttp` applies no status filter at all — the body would
// reach the ndjson parser, which would fail with "Received empty HTTP
// response", losing the status, the document and `Retry-After` alike. One case
// per refusal the deployment makes: 429, 503, 403.

const fetchStub = installFetchStub();

const answer = (response: () => Response): void => {
  fetchStub.mockImplementation(() => Promise.resolve(response()));
};

/** The rejection of a `/rpc` call, whatever it is. */
const failureOfStatusCall = async (): Promise<unknown> =>
  rpcCall('status', undefined).then(
    () => {
      throw new Error('the call was expected to fail');
    },
    (error: unknown) => error,
  );

/**
 * The refusal instance carried across the protocol boundary, read by the exact
 * nesting `makeProtocolHttp` produces rather than by a search: the interceptor
 * fails with an `HttpClientError` whose `reason` is a `StatusCodeError`, the
 * protocol rewrites that into `RpcClientError.reason` as an
 * `HttpClientErrorSchema` whose `cause` is the `StatusCodeError` object itself,
 * and the refusal is that object's `cause`. If any link of that changes, this
 * reads `undefined` and every case below says so.
 */
const carriedRefusal = (error: unknown): unknown => {
  if (!Predicate.isTagged(error, 'RpcClientError')) return undefined;
  const reason: unknown = Predicate.hasProperty(error, 'reason')
    ? error.reason
    : undefined;
  if (!Predicate.isTagged(reason, 'HttpError')) return undefined;
  const statusCodeError: unknown = Predicate.hasProperty(reason, 'cause')
    ? reason.cause
    : undefined;
  return Predicate.hasProperty(statusCodeError, 'cause')
    ? statusCodeError.cause
    : undefined;
};

/**
 * What the server answers a successful `status` with, framed exactly as the
 * ndjson protocol frames it: one JSON object per line, the terminal one an
 * `Exit`. `InstanceStatus` declares no transforms, so its encoded form is its
 * decoded form and this literal is both.
 */
const INSTANCE_STATUS: InstanceStatus = {
  name: 'Studio under test',
  version: '0.0.0-test',
  auth: {
    enabled: true,
    magicLink: true,
    emailAndPassword: false,
    socialProviders: ['google'],
  },
  deployment: { mode: 'self-hosted', billing: false },
  setup: { required: false },
};

/**
 * The id the client put on the request it just posted; the reply must echo it.
 *
 * The protocol hands `fetch` an encoded body rather than a string — ndjson
 * frames are bytes by the time they reach the transport — so this decodes
 * before reading the first line.
 */
const postedRequestId = (init: RequestInit | undefined): unknown => {
  const body = init?.body;
  const text =
    typeof body === 'string'
      ? body
      : ArrayBuffer.isView(body)
        ? new TextDecoder().decode(body)
        : undefined;
  if (text === undefined) {
    throw new Error('the rpc request body was expected to be ndjson');
  }
  const [first] = text.split('\n');
  if (first === undefined || first === '') {
    throw new Error('the rpc request body was empty');
  }
  const message: unknown = JSON.parse(first);
  return Predicate.hasProperty(message, 'id') ? message.id : undefined;
};

describe('a response that is not a refusal', () => {
  it('reaches the rpc parser untouched', async () => {
    // The interceptor's success path, which every other case in this file
    // would pass without: it reads the status and then has to hand a 200
    // straight on with the body unread, or nothing works at all. A real ndjson
    // `Exit` frame is what makes that observable — a call that resolves with
    // the decoded document proves the body reached the parser intact.
    fetchStub.mockImplementation((_input, init) =>
      Promise.resolve(
        new Response(
          `${JSON.stringify({
            _tag: 'Exit',
            requestId: postedRequestId(init),
            exit: { _tag: 'Success', value: INSTANCE_STATUS },
          })}\n`,
          { status: 200, headers: { 'content-type': 'application/ndjson' } },
        ),
      ),
    );

    await expect(rpcCall('status', undefined)).resolves.toEqual(
      INSTANCE_STATUS,
    );
  });
});

describe('a refusal on the HTTP plane', () => {
  it('reports a 429 as rate limited, with the interval it named', async () => {
    answer(() =>
      problemResponse(
        429,
        { type: 'about:blank', title: 'Too Many Requests', status: 429 },
        { 'retry-after': '30' },
      ),
    );

    const error = await failureOfStatusCall();

    expect(carriedRefusal(error)).toBeInstanceOf(RateLimited);
    expect(refusalOf(error)).toEqual({
      kind: 'rateLimited',
      retryAfterSeconds: 30,
    });
    expect(retryAfterSeconds(error)).toBe(30);
  });

  it('reports a 503 as maintenance', async () => {
    answer(() =>
      problemResponse(
        503,
        {
          type: 'about:blank',
          title: 'Service Unavailable',
          status: 503,
          detail: 'A migration is running.',
        },
        { 'retry-after': '120' },
      ),
    );

    const error = await failureOfStatusCall();

    const refusal = carriedRefusal(error);
    expect(refusal).toBeInstanceOf(Maintenance);
    // The document's own members ride along; the class supplies the rest.
    expect(refusal).toMatchObject({ detail: 'A migration is running.' });
    expect(refusalOf(error)).toEqual({ kind: 'maintenance' });
    expect(retryAfterSeconds(error)).toBe(120);
  });

  it('keeps a maintenance interval the rate limiter’s bound would refuse', async () => {
    // One problem document is decoded for every status, and the two members
    // that carry an interval are not declared alike: `RateLimited` bounds it
    // to a whole number of seconds, `Maintenance` does not, because a
    // migration's estimate is whatever the server measured. Reading a 503 with
    // the rate limiter's bound drops the WHOLE document — `detail` and all —
    // and leaves a maintenance refusal that says nothing and names no
    // interval. The header is absent here on purpose: it is the only other
    // place the interval could come from.
    answer(() =>
      problemResponse(503, {
        title: 'Service Unavailable',
        detail: 'A migration is running.',
        retryAfterSeconds: 1.5,
      }),
    );

    const error = await failureOfStatusCall();

    const refusal = carriedRefusal(error);
    expect(refusal).toBeInstanceOf(Maintenance);
    expect(refusal).toMatchObject({ detail: 'A migration is running.' });
    expect(retryAfterSeconds(error)).toBe(1.5);
  });

  it('reports a 403 as forbidden', async () => {
    answer(() =>
      problemResponse(403, {
        type: 'about:blank',
        title: 'Forbidden',
        status: 403,
      }),
    );

    const error = await failureOfStatusCall();

    expect(carriedRefusal(error)).toBeInstanceOf(Forbidden);
    expect(refusalOf(error)).toEqual({ kind: 'forbidden' });
    expect(retryAfterSeconds(error)).toBeUndefined();
  });

  it('gives a 429 with no interval the limiter’s own floor', async () => {
    // The contract makes the interval required — a caller told to back off with
    // no interval cannot comply — and the server's limiter never sends zero,
    // because a `Retry-After: 0` invites an immediate retry.
    answer(() => problemResponse(429, { title: 'Too Many Requests' }));

    const error = await failureOfStatusCall();

    expect(refusalOf(error)).toEqual({
      kind: 'rateLimited',
      retryAfterSeconds: 1,
    });
  });

  it('survives an interval the contract would refuse', async () => {
    // The interval reaches `new RateLimited(...)`, and an Effect class
    // constructor validates: the contract declares the field an integer >= 0,
    // so a body carrying `-1` or `1.5` would throw inside the interceptor and
    // the refusal would arrive as a defect no screen can read. The 429 branch
    // reads the interval through the contract's own field schema first, so
    // such a value counts as no interval — the document still decodes, and the
    // status still reports the refusal, with the floor.
    for (const refused of [-1, 1.5]) {
      answer(() =>
        problemResponse(429, {
          title: 'Too Many Requests',
          retryAfterSeconds: refused,
        }),
      );

      const error = await failureOfStatusCall();

      expect(refusalOf(error)).toEqual({
        kind: 'rateLimited',
        retryAfterSeconds: 1,
      });
    }
  });

  it('ignores a Retry-After that is not whole seconds', async () => {
    // RFC 9110 also allows an HTTP-date, and a fractional value is neither
    // form; reading either as a number is how a nonsense interval would reach
    // the contract's checks.
    answer(() =>
      problemResponse(
        429,
        { title: 'Too Many Requests' },
        { 'retry-after': '0.5' },
      ),
    );

    const error = await failureOfStatusCall();

    expect(refusalOf(error)).toEqual({
      kind: 'rateLimited',
      retryAfterSeconds: 1,
    });
  });

  it('still reports a status it has no name for', async () => {
    // A 500 is not one of the three, and reporting it as an ordinary "the
    // request failed" is how a deployment-level refusal becomes invisible.
    answer(() => new Response('nothing to read here', { status: 500 }));

    const error = await failureOfStatusCall();

    expect(carriedRefusal(error)).toBeUndefined();
    expect(refusalOf(error)).toEqual({ kind: 'transport' });
  });

  it('reports a request that never arrived as transport', async () => {
    fetchStub.mockImplementation(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    );

    const error = await failureOfStatusCall();

    expect(refusalOf(error)).toEqual({ kind: 'transport' });
    expect(retryAfterSeconds(error)).toBeUndefined();
  });
});

describe('a refusal on the rpc plane', () => {
  // The same two functions, so a caller never has to know which plane refused
  // it. These arrive as real class instances through `runPromiseExit` +
  // `Cause.findErrorOption`, which is what makes `instanceof` sound.
  it('reads the typed error the handler failed with', () => {
    expect(refusalOf(new RateLimited({ retryAfterSeconds: 42 }))).toEqual({
      kind: 'rateLimited',
      retryAfterSeconds: 42,
    });
    expect(retryAfterSeconds(new RateLimited({ retryAfterSeconds: 42 }))).toBe(
      42,
    );
    expect(refusalOf(new Maintenance({}))).toEqual({ kind: 'maintenance' });
    expect(retryAfterSeconds(new Maintenance({}))).toBeUndefined();
    expect(refusalOf(new Forbidden({}))).toEqual({ kind: 'forbidden' });
    expect(refusalOf(new NotFound({}))).toEqual({ kind: 'notFound' });
  });

  it('is not a refusal when nothing refused', () => {
    expect(refusalOf(new Conflict({ reason: 'emailTaken' }))).toBeUndefined();
    expect(refusalOf(new Error('something else'))).toBeUndefined();
    expect(refusalOf(undefined)).toBeUndefined();
  });
});

describe('the guards the screens branch on', () => {
  it('narrow the contract classes and nothing else', () => {
    expect(isForbidden(new Forbidden({}))).toBe(true);
    expect(isForbidden(new NotFound({}))).toBe(false);
    expect(isConflict(new Conflict({ reason: 'staleRevision' }))).toBe(true);
    expect(isConflict(new Forbidden({}))).toBe(false);
    expect(isNotFound(new NotFound({}))).toBe(true);
    expect(isNotFound(new Conflict({}))).toBe(false);
  });
});
