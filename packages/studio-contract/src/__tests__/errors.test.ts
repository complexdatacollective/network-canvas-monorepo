import { Schema, SchemaAST } from 'effect';
import { describe, expect, it } from 'vitest';

import { ParticipantRpcs } from '../rpc/participant.ts';
import { StudioRpcs } from '../rpc/studio.ts';
import {
  Conflict,
  Forbidden,
  Maintenance,
  NotFound,
  NotFoundResponse,
  RateLimited,
  Unauthorized,
} from '../schema/errors.ts';
import {
  LinkUnavailable,
  SessionEnded,
  SessionTakenOver,
} from '../schema/participant.ts';
import { ProtocolAuthorizationError } from '../schema/protocol.ts';
import { StudyCommandError } from '../schema/study.ts';
import { TeamCommandError } from '../schema/team.ts';

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
    const document = encode();
    // The wire document itself carries the tag: one member encoded without
    // it is the first step towards the ambiguity described above, and it is
    // caught here before a second member makes the union misdecode.
    expect(document).toMatchObject({ _tag: tag });
    expect(decodeUnion(document)._tag).toBe(tag);
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

// Every error a procedure declares, round-tripped through that procedure's own
// codec. The point is the whole declared union, not the class in isolation: a
// member only reaches a client if the union it sits in can encode it AND can
// pick it out again on the way back, and the second half is what a shared
// four-key problem shape puts at risk.

type ErrorSample = {
  /**
   * A thunk, not a shared instance: a case that mutated a shared one would
   * change what every later case round-trips.
   */
  readonly make: () => unknown;
  /**
   * Closes over the class, so the decoded value is checked against the real
   * constructor rather than against a tag string that any object could carry.
   */
  readonly isInstance: (value: unknown) => boolean;
};

const SAMPLES = new Map<string, ErrorSample>([
  [
    'Unauthorized',
    {
      make: () => new Unauthorized({}),
      isInstance: (value) => value instanceof Unauthorized,
    },
  ],
  [
    'Forbidden',
    {
      make: () => new Forbidden({}),
      isInstance: (value) => value instanceof Forbidden,
    },
  ],
  [
    'NotFound',
    {
      make: () => new NotFound({}),
      isInstance: (value) => value instanceof NotFound,
    },
  ],
  [
    'Conflict',
    {
      make: () => new Conflict({}),
      isInstance: (value) => value instanceof Conflict,
    },
  ],
  [
    'RateLimited',
    {
      make: () => new RateLimited({ retryAfterSeconds: 1 }),
      isInstance: (value) => value instanceof RateLimited,
    },
  ],
  [
    'TeamCommandError',
    {
      make: () => new TeamCommandError({ code: 'DELIVERY_IN_PROGRESS' }),
      isInstance: (value) => value instanceof TeamCommandError,
    },
  ],
  [
    'StudyCommandError',
    {
      make: () => new StudyCommandError({ code: 'CONFLICT' }),
      isInstance: (value) => value instanceof StudyCommandError,
    },
  ],
  [
    'ProtocolAuthorizationError',
    {
      make: () => new ProtocolAuthorizationError({}),
      isInstance: (value) => value instanceof ProtocolAuthorizationError,
    },
  ],
  [
    'SessionEnded',
    {
      make: () => new SessionEnded({ state: 'expired' }),
      isInstance: (value) => value instanceof SessionEnded,
    },
  ],
  [
    'SessionTakenOver',
    {
      make: () => new SessionTakenOver({ holderEpoch: 2 }),
      isInstance: (value) => value instanceof SessionTakenOver,
    },
  ],
  [
    'LinkUnavailable',
    {
      make: () => new LinkUnavailable({ state: 'revoked' }),
      isInstance: (value) => value instanceof LinkUnavailable,
    },
  ],
]);

const isUnionSchema = (
  schema: Schema.Top,
): schema is Schema.Union<ReadonlyArray<Schema.Top>> =>
  SchemaAST.isUnion(schema.ast);

/**
 * The leaves of a procedure's error channel. `Rpc.make` stores `Schema.Never`
 * for a procedure that declares no error, which has no members at all; a lone
 * class is its own single member. The recursion is for a union built out of
 * other unions, which the contract does not do today but which would otherwise
 * hide members from this walk.
 */
const errorMembers = (schema: Schema.Top): ReadonlyArray<Schema.Top> => {
  if (SchemaAST.isNever(schema.ast)) {
    return [];
  }

  return isUnionSchema(schema)
    ? schema.members.flatMap(errorMembers)
    : [schema];
};

/**
 * `Schema.Top` is too wide to decode through: its decoding and encoding
 * service channels are `unknown`, and the sync codecs only accept a schema
 * that needs no services. Every error schema the contract declares needs none,
 * which is exactly what the rpc transport requires of them.
 */
type ServicelessSchema = Schema.Codec<unknown, unknown>;

type ErrorCase = {
  readonly procedure: string;
  readonly memberTag: string | undefined;
  readonly errorSchema: ServicelessSchema;
};

// Enumerated at collection time so each member gets its own reported test, but
// nothing is encoded here: the documents are built in the test bodies, where a
// bad one fails its own case instead of the whole file's collection.
const errorCases: ReadonlyArray<ErrorCase> = [
  ...StudioRpcs.requests,
  ...ParticipantRpcs.requests,
].flatMap(([procedure, rpc]) =>
  errorMembers(rpc.errorSchema).map((member) => ({
    procedure,
    memberTag: Schema.resolveAnnotations(member)?.identifier,
    errorSchema: rpc.errorSchema,
  })),
);

const roundTrip = (
  errorSchema: ServicelessSchema,
  error: unknown,
): { readonly encoded: unknown; readonly decoded: unknown } => {
  const codec = Schema.toCodecJson(errorSchema);
  const encoded = Schema.encodeUnknownSync(codec)(error);

  return { encoded, decoded: Schema.decodeUnknownSync(codec)(encoded) };
};

describe('every error a procedure declares', () => {
  it.each(errorCases)(
    'round-trips $memberTag through the codec of $procedure',
    ({ memberTag, errorSchema }) => {
      if (memberTag === undefined) {
        throw new Error(
          'A declared error member carries no `identifier` annotation, so no sample can be keyed to it.',
        );
      }

      const sample = SAMPLES.get(memberTag);
      if (sample === undefined) {
        throw new Error(
          `No sample for the declared error \`${memberTag}\`. Add one to SAMPLES so the new class gets a round-trip case.`,
        );
      }

      const { encoded, decoded } = roundTrip(errorSchema, sample.make());

      // On the wire and back: a member whose encoding drops `_tag` would be
      // indistinguishable from any other problem document in the union.
      expect(encoded).toMatchObject({ _tag: memberTag });
      expect(decoded).toMatchObject({ _tag: memberTag });
      expect(sample.isInstance(decoded)).toBe(true);
    },
  );

  it('is walked over both groups, and leaves no sample unused', () => {
    expect(errorCases.length).toBeGreaterThan(0);
    expect(new Set(errorCases.map((errorCase) => errorCase.memberTag))).toEqual(
      new Set(SAMPLES.keys()),
    );
  });
});
