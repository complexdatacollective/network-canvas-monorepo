import { Effect, Schema } from 'effect';
import * as HttpApiSchema from 'effect/http-api/HttpApiSchema';

export const problemFields = (title: string, status: number) => ({
  type: Schema.String.pipe(
    Schema.withConstructorDefault(Effect.succeed('about:blank')),
  ),
  title: Schema.String.pipe(
    Schema.withConstructorDefault(Effect.succeed(title)),
  ),
  status: Schema.Int.pipe(
    Schema.withConstructorDefault(Effect.succeed(status)),
  ),
  detail: Schema.optionalKey(Schema.String),
  instance: Schema.optionalKey(Schema.String),
});

export const asProblem =
  (status: number) =>
  <S extends Schema.Top>(self: S) =>
    self.pipe(
      HttpApiSchema.status(status),
      HttpApiSchema.asJson({ contentType: 'application/problem+json' }),
    );
