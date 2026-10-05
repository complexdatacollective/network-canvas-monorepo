import { Predicate } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  Conflict,
  Forbidden,
  Maintenance,
  NotFound,
  RateLimited,
  Unauthorized,
} from '@codaco/studio-contract/schema/errors';
import type { InstanceStatus } from '@codaco/studio-contract/schema/status';

import { refusalRetryDelay, retryRefusals } from '../../lib/queryClient.ts';
import { installFetchStub, problemResponse } from '../../test/fetchStub.ts';
import {
  isConflict,
  isForbidden,
  isNotFound,
  refusalOf,
  retryAfterSeconds,
} from '../errors.ts';
import { rpcCall } from '../rpc.ts';

const fetchStub = installFetchStub();

const answer = (response: () => Response): void => {
  fetchStub.mockImplementation(() => Promise.resolve(response()));
};

const failureOfStatusCall = async (): Promise<unknown> =>
  rpcCall('status', undefined).then(
    () => {
      throw new Error('the call was expected to fail');
    },
    (error: unknown) => error,
  );

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
    expect(refusal).toMatchObject({ detail: 'A migration is running.' });
    expect(refusalOf(error)).toEqual({ kind: 'maintenance' });
    expect(retryAfterSeconds(error)).toBe(120);
  });

  it('keeps a maintenance interval the rate limiter’s bound would refuse', async () => {
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

  it('reports a 401 as unauthorized', async () => {
    answer(() =>
      problemResponse(401, {
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
      }),
    );

    const error = await failureOfStatusCall();

    expect(carriedRefusal(error)).toBeInstanceOf(Unauthorized);
    expect(refusalOf(error)).toEqual({ kind: 'unauthorized' });
    expect(retryAfterSeconds(error)).toBeUndefined();
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
    answer(() => problemResponse(429, { title: 'Too Many Requests' }));

    const error = await failureOfStatusCall();

    expect(refusalOf(error)).toEqual({
      kind: 'rateLimited',
      retryAfterSeconds: 1,
    });
  });

  it('survives an interval the contract would refuse', async () => {
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
    expect(refusalOf(new Unauthorized({}))).toEqual({ kind: 'unauthorized' });
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

const POLICY = [
  {
    status: 401,
    kind: 'unauthorized',
    typed: () => new Unauthorized({}),
    retries: [false, false],
  },
  {
    status: 403,
    kind: 'forbidden',
    typed: () => new Forbidden({}),
    retries: [false, false],
  },
  {
    status: 404,
    kind: 'notFound',
    typed: () => new NotFound({}),
    retries: [false, false],
  },
  {
    status: 429,
    kind: 'rateLimited',
    typed: () => new RateLimited({ retryAfterSeconds: 7 }),
    retries: [true, false],
  },
  {
    status: 503,
    kind: 'maintenance',
    typed: () => new Maintenance({ retryAfterSeconds: 7 }),
    retries: [true, true],
  },
] as const;

const PLANES = [
  {
    plane: 'the HTTP plane',
    failure: (row: (typeof POLICY)[number]) => {
      answer(() =>
        problemResponse(
          row.status,
          { title: 'Refused', status: row.status },
          { 'retry-after': '7' },
        ),
      );
      return failureOfStatusCall();
    },
  },
  {
    plane: 'the rpc plane',
    failure: (row: (typeof POLICY)[number]) => Promise.resolve(row.typed()),
  },
] as const;

describe('the retry policy, on both planes', () => {
  it.each(POLICY.flatMap((row) => PLANES.map((plane) => ({ row, ...plane }))))(
    'treats $row.status on $plane as $row.kind',
    async ({ row, failure }) => {
      const error = await failure(row);

      expect(refusalOf(error)?.kind).toBe(row.kind);
      expect([retryRefusals(0, error), retryRefusals(3, error)]).toEqual(
        row.retries,
      );
      if (row.retries[0]) expect(refusalRetryDelay(0, error)).toBe(7_000);
    },
  );
});
