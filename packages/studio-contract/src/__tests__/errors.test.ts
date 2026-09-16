import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  Conflict,
  Forbidden,
  Maintenance,
  NotFound,
  NotFoundResponse,
  RateLimited,
  Unauthorized,
} from '../schema/errors.ts';

// `Schema.toCodecJson` is the codec the rpc transport derives for a payload or
// error (`RpcServer`'s `codecFor`), so encoding through it is what actually
// reaches a client.
const encodeUnauthorized = Schema.encodeUnknownSync(
  Schema.toCodecJson(Unauthorized),
);
const encodeForbidden = Schema.encodeUnknownSync(Schema.toCodecJson(Forbidden));
const encodeNotFound = Schema.encodeUnknownSync(Schema.toCodecJson(NotFound));
const encodeConflict = Schema.encodeUnknownSync(Schema.toCodecJson(Conflict));
const encodeRateLimited = Schema.encodeUnknownSync(
  Schema.toCodecJson(RateLimited),
);
const encodeMaintenance = Schema.encodeUnknownSync(
  Schema.toCodecJson(Maintenance),
);

describe('the shared problem documents', () => {
  it('completes a bare Unauthorized', () => {
    expect(encodeUnauthorized(new Unauthorized({}))).toEqual({
      _tag: 'Unauthorized',
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
    });
  });

  it('completes a bare Forbidden', () => {
    expect(encodeForbidden(new Forbidden({}))).toEqual({
      _tag: 'Forbidden',
      type: 'about:blank',
      title: 'Forbidden',
      status: 403,
    });
  });

  it('completes a bare NotFound', () => {
    expect(encodeNotFound(new NotFound({}))).toEqual({
      _tag: 'NotFound',
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
    });
  });

  it('completes a bare Conflict', () => {
    expect(encodeConflict(new Conflict({}))).toEqual({
      _tag: 'Conflict',
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
    });
  });

  it('completes a bare RateLimited', () => {
    expect(
      encodeRateLimited(new RateLimited({ retryAfterSeconds: 0 })),
    ).toEqual({
      _tag: 'RateLimited',
      type: 'about:blank',
      title: 'Too Many Requests',
      status: 429,
      retryAfterSeconds: 0,
    });
  });

  it('completes a bare Maintenance', () => {
    expect(encodeMaintenance(new Maintenance({}))).toEqual({
      _tag: 'Maintenance',
      type: 'about:blank',
      title: 'Service Unavailable',
      status: 503,
    });
  });

  it('carries a Conflict reason alongside its detail', () => {
    expect(
      encodeConflict(new Conflict({ reason: 'emailTaken', detail: 'x' })),
    ).toEqual({
      _tag: 'Conflict',
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      reason: 'emailTaken',
      detail: 'x',
    });
  });
});

describe('RateLimited.retryAfterSeconds', () => {
  it('encodes the interval a caller must wait', () => {
    expect(
      encodeRateLimited(new RateLimited({ retryAfterSeconds: 3 })),
    ).toMatchObject({ retryAfterSeconds: 3 });
  });

  it.each([
    ['a negative interval', -1],
    ['a fractional interval', 1.5],
  ])('refuses %s', (_label, retryAfterSeconds) => {
    expect(() => RateLimited.make({ retryAfterSeconds })).toThrow();
  });
});

describe('the error union', () => {
  // The reason `_tag` stays on the wire: without it every member is the same
  // four-key document, and the union would resolve each one to its first
  // structurally compatible member.
  const ProblemUnion = Schema.Union([
    Unauthorized,
    Forbidden,
    NotFound,
    Conflict,
    RateLimited,
    Maintenance,
  ]);
  const decodeUnion = Schema.decodeUnknownSync(
    Schema.toCodecJson(ProblemUnion),
  );

  // The documents are built inside the test body, not in the table: a table
  // evaluated at collection time turns one bad member into a whole-file
  // collection error, which reports as five other tests vanishing rather than
  // as the one that broke.
  it.each([
    ['Unauthorized', () => encodeUnauthorized(new Unauthorized({}))],
    ['Forbidden', () => encodeForbidden(new Forbidden({}))],
    ['NotFound', () => encodeNotFound(new NotFound({}))],
    ['Conflict', () => encodeConflict(new Conflict({}))],
    [
      'RateLimited',
      () => encodeRateLimited(new RateLimited({ retryAfterSeconds: 1 })),
    ],
    ['Maintenance', () => encodeMaintenance(new Maintenance({}))],
  ])('round-trips a %s back to its own tag', (tag, encode) => {
    expect(decodeUnion(encode())._tag).toBe(tag);
  });
});

describe('decoding a problem document', () => {
  it('refuses one missing `status`: constructor defaults never apply on decode', () => {
    expect(() =>
      Schema.decodeUnknownSync(Schema.toCodecJson(NotFound))({
        _tag: 'NotFound',
        type: 'about:blank',
        title: 'Not Found',
      }),
    ).toThrow();
  });
});

describe('the HttpApi view', () => {
  // `HttpApiSchema`'s own readers for these two annotations are `@internal` and
  // absent from the published types, so the test reads the annotations the way
  // they were written — which is also what those readers do.
  const EncodingAnnotation = Schema.Struct({ contentType: Schema.String });
  const readEncoding = Schema.decodeUnknownSync(EncodingAnnotation);

  it('reads the status HttpApi would answer with off the class itself', () => {
    expect(Schema.resolveAnnotations(NotFound)?.httpApiStatus).toBe(404);
  });

  it('serves the response view as problem+json', () => {
    const encoding = readEncoding(
      Schema.resolveAnnotations(NotFoundResponse)?.['~httpApiEncoding'],
    );

    expect(encoding.contentType).toBe('application/problem+json');
  });
});
