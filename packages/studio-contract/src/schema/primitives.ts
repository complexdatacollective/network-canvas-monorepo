import { Schema } from 'effect';

// The value shapes that recur across the contract's payloads and results.

/**
 * Copied from zod 4.5.4's default email pattern (`zod/v4/core/regexes.js`, the
 * `email` export), which is what `z.email()` installs when no pattern is
 * given. Reproduced rather than approximated so that the set of addresses this
 * contract accepts is exactly the set today's oRPC boundary accepts — there is
 * no `Schema.Email` in Effect 4 to defer to, and a stricter or looser regex
 * would silently change who can be invited. The only departure is the two
 * redundant backslashes inside the character classes, which the formatter
 * strips and which mean the same thing there.
 */
const EMAIL_PATTERN =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/** The 320-character bound is the one every `z.email().max(320)` carries. */
export const Email = Schema.String.check(
  Schema.isPattern(EMAIL_PATTERN),
  Schema.isMaxLength(320),
);

/**
 * A bounded string that a run of whitespace cannot satisfy. The database
 * carries the same rule as a `*_nonblank_check` constraint on several columns;
 * refusing it here makes a blank name a field error rather than a constraint
 * violation surfacing as a failed command.
 *
 * `label` names the field in the message, because the filter is shared and the
 * default message would otherwise say nothing about which field was blank.
 */
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
 * A PostgreSQL `bigint` as it travels on the wire: base-10 digits in a string,
 * which the server hands straight to a `::bigint` cast. The digit budget and
 * the range bound keep an over-range decimal an input rejection instead of a
 * numeric_value_out_of_range error raised inside the query.
 *
 * The range predicate re-tests the pattern because it has to be total. Under
 * the default `errors: 'first'` a failing pattern check short-circuits and the
 * range filter never runs — but under `{ errors: 'all' }` every check runs, and
 * `BigInt(value)` throws on a non-numeric string rather than returning false.
 * A throw inside a filter is a defect, not an issue, so it would escape the
 * parse result entirely instead of being reported as a validation failure.
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

/** Counts and indices: whole numbers at or above zero. */
export const NonNegativeInt = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);
