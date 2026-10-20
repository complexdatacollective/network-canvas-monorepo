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
  FinishUnrecognised,
  LinkUnavailable,
  SessionEnded,
  SessionOutOfDate,
  SessionTakenOver,
} from '../schema/participant.ts';
import { ProtocolAuthorizationError } from '../schema/protocol.ts';
import { StudyCommandError } from '../schema/study.ts';
import { TeamCommandError } from '../schema/team.ts';

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
    expect(document).toMatchObject({ _tag: tag });
    expect(decodeUnion(document)._tag).toBe(tag);
  });
});

describe('decoding a problem document', () => {
  it.each([1.5, 'Infinity', '-Infinity', 'NaN'])(
    'refuses %s as a status: a status is an integer',
    (status) => {
      expect(() =>
        Schema.decodeUnknownSync(Schema.toCodecJson(NotFound))({
          _tag: 'NotFound',
          type: 'about:blank',
          title: 'Not Found',
          status,
        }),
      ).toThrow();
    },
  );

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
  // `HttpApiSchema`'s own readers for these two annotations are `@internal`.
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

type ErrorSample = {
  readonly make: () => unknown;
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
      make: () => new SessionEnded({ state: 'completed' }),
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
    'SessionOutOfDate',
    {
      make: () => new SessionOutOfDate({ revision: '4' }),
      isInstance: (value) => value instanceof SessionOutOfDate,
    },
  ],
  [
    'FinishUnrecognised',
    {
      make: () => new FinishUnrecognised({}),
      isInstance: (value) => value instanceof FinishUnrecognised,
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

const errorMembers = (schema: Schema.Top): ReadonlyArray<Schema.Top> => {
  if (SchemaAST.isNever(schema.ast)) {
    return [];
  }

  return isUnionSchema(schema)
    ? schema.members.flatMap(errorMembers)
    : [schema];
};

type ServicelessSchema = Schema.Codec<unknown, unknown>;

type ErrorCase = {
  readonly procedure: string;
  readonly memberTag: string | undefined;
  readonly errorSchema: ServicelessSchema;
};

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
