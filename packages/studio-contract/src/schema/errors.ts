import { Schema } from 'effect';

import { asProblem, problemFields } from './problem.ts';

// The shared error vocabulary. Six classes cover every refusal any Studio
// surface makes; a procedure that needs to say more says it in `detail`, or
// declares an error of its own alongside these.
//
// `_tag` stays on the wire, deliberately. Every problem document here has the
// same four required keys, so with the tag omitted from the encoding a
// `Schema.Union([NotFound, Conflict])` decodes a Conflict document as a
// NotFound: the union tries members in order and the first one matches
// structurally. The client would then catch the wrong tag. RFC 9457 allows
// extension members on a problem document, so `_tag` is a legal key to carry
// and it is the only thing that makes these six discriminable. Do not reach
// for `Schema.tagDefaultOmit` here.
//
// The `httpApiStatus` annotation on each class is what HttpApi reads to choose
// a response status; the `…Response` views below add the problem+json content
// type for the endpoints that return them.

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  'Unauthorized',
  problemFields('Unauthorized', 401),
  { httpApiStatus: 401 },
) {}

/**
 * Deliberately carries no reason beyond the generic `detail`. Studio refuses a
 * study, team or protocol the caller may not see by pretending it does not
 * exist; a machine-readable reason on the refusal would turn that into an
 * oracle, letting a caller tell "exists, not yours" from "does not exist" by
 * reading the field.
 */
export class Forbidden extends Schema.TaggedError<Forbidden>()(
  'Forbidden',
  problemFields('Forbidden', 403),
  { httpApiStatus: 403 },
) {}

export class NotFound extends Schema.TaggedError<NotFound>()(
  'NotFound',
  problemFields('Not Found', 404),
  { httpApiStatus: 404 },
) {}

export class Conflict extends Schema.TaggedError<Conflict>()(
  'Conflict',
  {
    ...problemFields('Conflict', 409),
    /**
     * A stable tag string the client can branch on (`emailTaken`,
     * `staleRevision`), not prose — prose belongs in `detail`, which is what
     * a human reads.
     */
    reason: Schema.optionalKey(Schema.String),
  },
  { httpApiStatus: 409 },
) {}

export class RateLimited extends Schema.TaggedError<RateLimited>()(
  'RateLimited',
  {
    ...problemFields('Too Many Requests', 429),
    /** Required: a caller told to back off with no interval cannot comply. */
    retryAfterSeconds: Schema.Number.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(0),
    ),
  },
  { httpApiStatus: 429 },
) {}

export class Maintenance extends Schema.TaggedError<Maintenance>()(
  'Maintenance',
  {
    ...problemFields('Service Unavailable', 503),
    /** Optional, unlike the rate limiter's: a migration's length is unknown. */
    retryAfterSeconds: Schema.optionalKey(Schema.Number),
  },
  { httpApiStatus: 503 },
) {}

export const UnauthorizedResponse = asProblem(401)(Unauthorized);
export const ForbiddenResponse = asProblem(403)(Forbidden);
export const NotFoundResponse = asProblem(404)(NotFound);
export const ConflictResponse = asProblem(409)(Conflict);
export const RateLimitedResponse = asProblem(429)(RateLimited);
export const MaintenanceResponse = asProblem(503)(Maintenance);
