import { Schema } from 'effect';

import { asProblem, problemFields } from './problem.ts';

// `_tag` stays on the wire: every problem document has the same four keys, so
// without it a union decodes each member as its first. Do not reach for
// `Schema.tagDefaultOmit` here.

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  'Unauthorized',
  problemFields('Unauthorized', 401),
  { httpApiStatus: 401 },
) {}

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
    reason: Schema.optionalKey(Schema.String),
  },
  { httpApiStatus: 409 },
) {}

export class RateLimited extends Schema.TaggedError<RateLimited>()(
  'RateLimited',
  {
    ...problemFields('Too Many Requests', 429),
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
