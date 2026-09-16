import { Effect, Schema } from 'effect';
import { HttpApiSchema } from 'effect/unstable/httpapi';

// One RFC 9457 "problem details" shape, shared by all three surfaces Studio
// serves: the rpc plane, the participant plane, and the public `/api/v1`. A
// single document shape means an error rendered by the web shell, by a
// participant client, or by a third-party integration is the same object with
// the same keys, whichever door it came out of.

/**
 * The four members every problem document carries, plus the two RFC 9457
 * allows to be absent.
 *
 * `type`, `title` and `status` have constructor defaults so that
 * `new NotFound({})` is a complete document — a handler raising an error
 * should not have to restate what the class already knows. Constructor
 * defaults apply to `make`/`new` only and never to decoding, which is the
 * behaviour a contract wants: a response body that arrives without `status` is
 * a decode failure rather than a document quietly completed by the reader.
 */
export const problemFields = (title: string, status: number) => ({
  type: Schema.String.pipe(
    Schema.withConstructorDefault(Effect.succeed('about:blank')),
  ),
  title: Schema.String.pipe(
    Schema.withConstructorDefault(Effect.succeed(title)),
  ),
  status: Schema.Number.pipe(
    Schema.withConstructorDefault(Effect.succeed(status)),
  ),
  detail: Schema.optionalKey(Schema.String),
  instance: Schema.optionalKey(Schema.String),
});

/** The HttpApi-facing view of a contract error: status-coded, problem+json. */
export const asProblem =
  (status: number) =>
  <S extends Schema.Top>(self: S) =>
    self.pipe(
      HttpApiSchema.status(status),
      HttpApiSchema.asJson({ contentType: 'application/problem+json' }),
    );
