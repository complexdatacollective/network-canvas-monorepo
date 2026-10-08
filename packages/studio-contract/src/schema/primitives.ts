import { Schema } from 'effect';

/**
 * Copied from zod 4.5.4's default email pattern, so the accepted set of
 * addresses is unchanged.
 */
const EMAIL_PATTERN =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

export const EmailAddress = Schema.String.check(
  Schema.isPattern(EMAIL_PATTERN),
  Schema.isMaxLength(320),
);

export const Email = Schema.RedactedFromValue(EmailAddress);

export const PrivateString = Schema.RedactedFromValue(Schema.String);

export const NonBlankString = (max: number, label: string) =>
  Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(max),
    Schema.makeFilter<string>(
      (value) =>
        value.trim().length > 0 ||
        `${label} must contain a non-whitespace character`,
    ),
  );

const PG_BIGINT_MAX = 9223372036854775807n;
const DECIMAL_SEQUENCE_PATTERN = /^\d{1,19}$/;

/**
 * The range predicate re-tests the pattern: under `{ errors: 'all' }` it runs
 * after a failed pattern check, and `BigInt(value)` would throw.
 */
export const DecimalSequence = Schema.String.check(
  Schema.isPattern(DECIMAL_SEQUENCE_PATTERN),
  Schema.makeFilter<string>(
    (value) =>
      !DECIMAL_SEQUENCE_PATTERN.test(value) ||
      BigInt(value) <= PG_BIGINT_MAX ||
      'must be within the PostgreSQL bigint range',
  ),
);

export const NonNegativeInt = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);
