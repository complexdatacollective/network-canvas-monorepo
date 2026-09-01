import { invariant } from 'es-toolkit';
import { z } from 'zod/mini';

import type { Variable } from '@codaco/protocol-validation';

import type { FieldValue, ValidationContext } from '../store/types';
import collectNetworkValues from './utils/collectNetworkValues';
import compareVariables from './utils/compareVariables';
import { getComparisonValue } from './utils/getComparisonValue';
import { getVariableDefinition } from './utils/getVariableDefinition';
import isMatchingValue from './utils/isMatchingValue';
import isUnanswered from './utils/isUnanswered';
// Type-only side-effect import (erased entirely, so it never reaches Vite's
// runtime resolver) so the `GlobalMeta` module augmentation below reaches
// every consumer of this file's `z.meta({ hint })` calls (and `helpers.tsx`,
// which reads them back out) — see the comment in ./zod.d.ts for why this
// can't just rely on fresco-ui's own tsconfig `include`.
import type * as _zod from './zod';

export type ValidationParameter =
  | string
  | number
  | boolean
  | Record<string, unknown>;

export type ValidationFunction<T extends ValidationParameter> = (
  // Parameter type is the value of the key/value pair of the protocol
  // validation object. required = boolean, maxLength = number,
  // unique = string etc.
  parameter: T,
  context?: ValidationContext,
) => (formValues: Record<string, FieldValue>) => z.ZodMiniType;

/**
 * Make a field required
 *
 * This works differently depending on the type of variable it is applied to:
 *
 * - text: not null, no strings with only spaces
 * - number: not null, but zero is permitted
 * - scalar: not null, zero is permitted
 * - datetime: not null, empty string is not permitted
 * - boolean: not null
 * - categorical: not null, empty array is not permitted
 */
export const required = (parameter?: boolean | string) => () => {
  if (parameter === false) {
    return z.unknown();
  }

  const message =
    typeof parameter === 'string'
      ? parameter
      : 'You must answer this question before continuing.';

  return z.unknown().check(
    z.superRefine((value, ctx) => {
      // `isUnanswered` is the shared definition of emptiness: nullish,
      // whitespace-only text, `NaN`, or an empty multi-select array. Every
      // optional rule short-circuits on the same predicate, so `required` and
      // the rules it fronts can never disagree about what "empty" means.
      if (isUnanswered(value)) {
        ctx.addIssue({
          code: 'custom',
          input: value,
          message: message,
          path: [],
        });
      }
    }),
  ); // No hint for required because we use the asterisk in the UI
};

/**
 * Require that a string be shorter than a maximum length.
 *
 * The one rule in this file that deliberately does NOT use `isUnanswered`:
 * an empty string is a present value here and trivially satisfies any bound,
 * including a maxLength of 0 (see the note in ./utils/isUnanswered). It
 * short-circuits on a nullish value only, so this optional rule applies once
 * a value of any length exists; `required` still owns emptiness. The bound is
 * guarded on defined-ness rather than truthiness so a maxLength of 0 is
 * honoured.
 */
const maxLength: ValidationFunction<number> = (max) => () => {
  invariant(
    typeof max === 'number' && !Number.isNaN(max),
    'Max length must be specified',
  );

  const hint = `Enter at most ${max} characters.`;

  return z.unknown().check(
    z.superRefine((value, ctx) => {
      if (value === undefined || value === null) {
        return;
      }
      if (typeof value !== 'string') return;
      if (value.length > max) {
        ctx.addIssue({
          code: 'custom',
          input: value,
          message: `Too long. Enter fewer than ${max} characters.`,
          path: [],
        });
      }
    }),
    z.meta({ hint }),
  );
};

/**
 * Require that a string be longer than a minimum length.
 *
 * Short-circuits on `isUnanswered` — the file's single definition of emptiness
 * — so this optional rule only applies once a value is present; `required`
 * owns emptiness. Whitespace-only text is unanswered to `required`, so it must
 * be unanswered here too, or a blank field is told both to answer the question
 * and to write more.
 */
const minLength: ValidationFunction<number> = (min) => () => {
  invariant(
    typeof min === 'number' && !Number.isNaN(min),
    'Min length must be specified',
  );

  const hint = `Enter at least ${min} characters.`;

  return z.unknown().check(
    z.superRefine((value, ctx) => {
      if (isUnanswered(value)) {
        return;
      }
      if (typeof value !== 'string') return;
      if (value.length < min) {
        ctx.addIssue({
          code: 'custom',
          input: value,
          message: `Too short. Enter at least ${min} characters.`,
          path: [],
        });
      }
    }),
    z.meta({ hint }),
  );
};

/**
 * Require that a number be greater than or equal to a minimum value.
 *
 * Short-circuits on `isUnanswered` so this optional rule only applies once a
 * value is present; `required` owns emptiness. The shared predicate has to run
 * BEFORE the coercion below, because `Number('   ')` and `Number([])` are both
 * `0` — an unanswered field would otherwise be reported as "too small".
 * Coerces string inputs from HTML number inputs.
 */
const minValue: ValidationFunction<number> = (min) => () => {
  invariant(
    typeof min === 'number' && !Number.isNaN(min),
    'Min value must be specified',
  );

  const hint = `Enter a value greater than or equal to ${min}.`;

  return z.unknown().check(
    z.superRefine((value, ctx) => {
      if (isUnanswered(value)) {
        return;
      }
      const numValue = Number(value);
      if (Number.isNaN(numValue)) return;
      if (numValue < min) {
        ctx.addIssue({
          code: 'custom',
          input: value,
          message: `Too small. Value must be at least ${min}.`,
          path: [],
        });
      }
    }),
    z.meta({ hint }),
  );
};

/**
 * Require that a number be less than or equal to a maximum value.
 *
 * Short-circuits on `isUnanswered` so this optional rule only applies once a
 * value is present; `required` owns emptiness. As with `minValue`, the shared
 * predicate has to run BEFORE the coercion below: `Number('   ')` and
 * `Number([])` are both `0`, which a negative bound would report as "too
 * large". The bound is guarded on defined-ness rather than truthiness so a
 * maxValue of 0 is honoured. Coerces string inputs from HTML number inputs.
 */
const maxValue: ValidationFunction<number> = (max) => () => {
  invariant(
    typeof max === 'number' && !Number.isNaN(max),
    'Max value must be specified',
  );

  const hint = `Enter a value less than or equal to ${max}.`;

  return z.unknown().check(
    z.superRefine((value, ctx) => {
      if (isUnanswered(value)) {
        return;
      }
      const numValue = Number(value);
      if (Number.isNaN(numValue)) return;
      if (numValue > max) {
        ctx.addIssue({
          code: 'custom',
          input: value,
          message: `Too large. Value must be at most ${max}.`,
          path: [],
        });
      }
    }),
    z.meta({ hint }),
  );
};

/**
 * Detects strings shaped like the ISO/HTML date-time literals accepted by
 * `<input type="date|month|week|time|datetime-local">`. A bare year like
 * "2000" is ambiguous with a number, so it's NOT treated as date-shaped
 * here — the caller checks the opposing side (param or value) for a
 * separator before committing to string-comparison mode.
 */
function matchesDatePattern(s: string): boolean {
  if (s === '') return false;
  // YYYY-MM, YYYY-MM-DD, YYYY-MM-DDTHH:MM(:SS)?
  if (/^\d{4}-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2})?)?)?$/.test(s)) {
    return true;
  }
  // HH:MM(:SS)? — <input type="time">
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return true;
  // YYYY-W## — <input type="week">
  if (/^\d{4}-W\d{2}$/.test(s)) return true;
  return false;
}

/**
 * Compare two ISO-style date/time strings that may be at different
 * resolutions (e.g. "2020", "2020-06", "2020-06-15"). Truncates both to the
 * shorter length before comparison so that a year value overlapping a
 * YYYY-MM-DD bound is considered in-range — matching DatePicker's UI, which
 * exposes partially-overlapping years/months.
 */
function compareDateStrings(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  const truncA = a.substring(0, len);
  const truncB = b.substring(0, len);
  if (truncA < truncB) return -1;
  if (truncA > truncB) return 1;
  return 0;
}

const YEAR_RE = /^(\d{4})$/;
const YEAR_MONTH_RE = /^(\d{4})-(\d{2})$/;
const DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function utcDateFromParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  // Date.UTC treats years 0-99 as 1900-1999; setUTCFullYear preserves them.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date;
}

/**
 * Format a min/max bound for human-readable display in validation hints.
 * Uses the runtime's locale via Intl.DateTimeFormat with timeZone: 'UTC' so
 * the formatted date matches the literal YYYY-MM-DD bound regardless of the
 * viewer's timezone. Returns the raw string for values we don't recognise
 * as date/time literals.
 */
function formatBoundForDisplay(bound: string): string {
  if (YEAR_RE.test(bound)) return bound;

  const yearMonth = YEAR_MONTH_RE.exec(bound);
  if (yearMonth) {
    const year = Number(yearMonth[1]);
    const month = Number(yearMonth[2]);
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(utcDateFromParts(year, month, 1));
  }

  const dateTime = DATE_TIME_RE.exec(bound);
  if (dateTime) {
    const year = Number(dateTime[1]);
    const month = Number(dateTime[2]);
    const day = Number(dateTime[3]);
    const hour = dateTime[4];
    if (hour !== undefined) {
      const date = utcDateFromParts(
        year,
        month,
        day,
        Number(hour),
        Number(dateTime[5]),
        dateTime[6] !== undefined ? Number(dateTime[6]) : 0,
      );
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(date);
    }
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'long',
      timeZone: 'UTC',
    }).format(utcDateFromParts(year, month, day));
  }

  const time = TIME_RE.exec(bound);
  if (time) {
    const anchor = new Date(Date.UTC(1970, 0, 1));
    anchor.setUTCHours(
      Number(time[1]),
      Number(time[2]),
      time[3] !== undefined ? Number(time[3]) : 0,
      0,
    );
    return new Intl.DateTimeFormat(undefined, {
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(anchor);
  }

  return bound;
}

/**
 * HTML-aligned minimum bound. Handles inputs whose `min` attribute is a
 * date/time ISO string (date, month, week, time, datetime-local) or a number
 * (number, range). Dispatches based on parameter type.
 *
 * Short-circuits on `isUnanswered` so this optional rule only applies once a
 * value is present; `required` owns emptiness. Both branches below would
 * otherwise mistake a blank for an answer: `Number('   ')` is `0`, and
 * `compareDateStrings('   ', '2000-01-01')` truncates to three characters and
 * sorts the spaces before the year.
 */
const min: ValidationFunction<number | string> = (minParam) => () => {
  invariant(
    minParam !== undefined && minParam !== null && minParam !== '',
    'Min must be specified',
  );

  const paramIsDateShaped =
    typeof minParam === 'string' && matchesDatePattern(minParam);
  const displayMin = paramIsDateShaped
    ? formatBoundForDisplay(minParam)
    : String(minParam);
  const hint = paramIsDateShaped
    ? `Must be on or after ${displayMin}.`
    : `Enter a value greater than or equal to ${displayMin}.`;

  return z.unknown().check(
    z.superRefine((value, ctx) => {
      if (isUnanswered(value)) {
        return;
      }

      const valueIsDateShaped =
        typeof value === 'string' && matchesDatePattern(value);

      if (paramIsDateShaped || valueIsDateShaped) {
        if (typeof value !== 'string' || typeof minParam !== 'string') return;
        if (compareDateStrings(value, minParam) < 0) {
          ctx.addIssue({
            code: 'custom',
            input: value,
            message: `Must be on or after ${displayMin}.`,
            path: [],
          });
        }
        return;
      }

      const numValue = Number(value);
      const numMin = Number(minParam);
      if (Number.isNaN(numValue) || Number.isNaN(numMin)) return;
      if (numValue < numMin) {
        ctx.addIssue({
          code: 'custom',
          input: value,
          message: `Too small. Value must be at least ${displayMin}.`,
          path: [],
        });
      }
    }),
    z.meta({ hint }),
  );
};

/**
 * HTML-aligned maximum bound. See `min` for dispatch rules, and for why the
 * shared `isUnanswered` short-circuit has to come before either branch.
 */
const max: ValidationFunction<number | string> = (maxParam) => () => {
  invariant(
    maxParam !== undefined && maxParam !== null && maxParam !== '',
    'Max must be specified',
  );

  const paramIsDateShaped =
    typeof maxParam === 'string' && matchesDatePattern(maxParam);
  const displayMax = paramIsDateShaped
    ? formatBoundForDisplay(maxParam)
    : String(maxParam);
  const hint = paramIsDateShaped
    ? `Must be on or before ${displayMax}.`
    : `Enter a value less than or equal to ${displayMax}.`;

  return z.unknown().check(
    z.superRefine((value, ctx) => {
      if (isUnanswered(value)) {
        return;
      }

      const valueIsDateShaped =
        typeof value === 'string' && matchesDatePattern(value);

      if (paramIsDateShaped || valueIsDateShaped) {
        if (typeof value !== 'string' || typeof maxParam !== 'string') return;
        if (compareDateStrings(value, maxParam) > 0) {
          ctx.addIssue({
            code: 'custom',
            input: value,
            message: `Must be on or before ${displayMax}.`,
            path: [],
          });
        }
        return;
      }

      const numValue = Number(value);
      const numMax = Number(maxParam);
      if (Number.isNaN(numValue) || Number.isNaN(numMax)) return;
      if (numValue > numMax) {
        ctx.addIssue({
          code: 'custom',
          input: value,
          message: `Too large. Value must be at most ${displayMax}.`,
          path: [],
        });
      }
    }),
    z.meta({ hint }),
  );
};

/**
 * Require that an array have a minimum number of elements.
 *
 * Short-circuits on `isUnanswered`, which counts an empty array as unanswered,
 * so this optional rule only applies once a selection has been made;
 * `required` owns emptiness. This is deliberate, not a gap, and has been
 * re-verified: `[]` is indistinguishable from "unanswered" at the value
 * level — CheckboxGroup (see CheckboxGroup.tsx `handleChange`) produces the
 * exact same `[]` whether a field was never touched or was ticked then
 * unticked, so there is no way to flag "cleared on purpose" without also
 * flagging "never answered". The protocol schema agrees: `minSelected` no
 * longer implies `required` as of the v8 migration (see
 * protocol-validation/src/schemas/8/migration.ts, the "min* validator no
 * longer implies required" note and backfill step), and
 * `categoricalValidations` in protocol-validation's variable.ts lets a
 * codebook pick `minSelected` without `required`. Pair `minSelected` with
 * `required: true` on the variable to also reject an empty selection.
 */
const minSelected: ValidationFunction<number> = (minParam) => () => {
  invariant(typeof minParam === 'number', 'Min items must be specified');

  const hint = `Select at least ${minParam} value${minParam === 1 ? '' : 's'}.`;

  return z.unknown().check(
    z.superRefine((value, ctx) => {
      if (isUnanswered(value)) {
        return;
      }
      if (!Array.isArray(value)) return;
      if (value.length < minParam) {
        ctx.addIssue({
          code: 'custom',
          input: value,
          message: `Too few selected. Select at least ${minParam} value${minParam === 1 ? '' : 's'}.`,
          path: [],
        });
      }
    }),
    z.meta({ hint }),
  );
};

/**
 * Require that an array have a maximum number of elements.
 *
 * Short-circuits on `isUnanswered`, like its `minSelected` sibling, and
 * returns silently on a value that is not a selection at all. The earlier
 * implementation parsed the value with `z.array(...)` behind a
 * `z.prefault(…, [null × maxParam])`: the prefault existed only to stop an
 * absent value being rejected, and every other shape that is not an array —
 * `null` from a cleared control, a stray string — fell through to Zod's own
 * "Invalid input: expected array, received null", which was shown to the
 * participant verbatim.
 */
const maxSelected: ValidationFunction<number> = (maxParam) => () => {
  invariant(typeof maxParam === 'number', 'Max items must be specified');

  const hint = `Select a maximum of ${maxParam} value${maxParam === 1 ? '' : 's'}.`;

  return z.unknown().check(
    z.superRefine((value, ctx) => {
      if (isUnanswered(value)) {
        return;
      }
      if (!Array.isArray(value)) return;
      if (value.length > maxParam) {
        ctx.addIssue({
          code: 'custom',
          input: value,
          message: `Too many items selected. Select a maximum of ${maxParam} value${maxParam === 1 ? '' : 's'}.`,
          path: [],
        });
      }
    }),
    z.meta({ hint }),
  );
};

/**
 * Require that a value is unique among all entities of the same type in the
 * current network
 */
const unique: ValidationFunction<string> = (attribute, context) => () => {
  invariant(
    context,
    'Validation context must be provided when using unique validation',
  );
  const { stageSubject, network, currentEntityId } = context;

  const hint = 'Must be unique.';

  return z.unknown().check(
    z.superRefine((value, ctx) => {
      invariant(
        stageSubject.entity !== 'ego',
        'Not applicable to ego entities',
      );
      invariant(
        typeof attribute === 'string',
        'Attribute must be specified for unique validation',
      );

      // Optional fields may be left unanswered more than once. `required`
      // owns emptiness; uniqueness begins only once a value is supplied.
      if (isUnanswered(value)) {
        return;
      }

      // Collect other values of the same type, excluding the entity
      // currently being edited (if any) so its own value isn't treated
      // as a duplicate.
      const existingValues = collectNetworkValues(
        network,
        stageSubject,
        attribute,
        currentEntityId,
      );

      if (existingValues.some((v) => isMatchingValue(value, v))) {
        ctx.addIssue({
          code: 'custom',
          message: 'This value is used elsewhere. It must be unique.',
          path: [],
        });
      }
    }),
    z.meta({ hint }),
  );
};

/**
 * The participant-facing name of a comparison rule's target, or `undefined`
 * when this form has none to offer.
 *
 * The codebook variable's `name` is the researcher's identifier for a column
 * of data — never something a participant should be shown — so it is
 * deliberately not a fallback here. The only participant-facing string for a
 * variable is the prompt/label the researcher authored on the stage field,
 * which the interview layer supplies as `variableLabels`. When the target is
 * answered somewhere the participant cannot see (an earlier stage), there is
 * no such string, and each rule falls back to a complete label-free sentence.
 *
 * The codebook lookup is retained for its existence invariant: a rule that
 * references a variable the subject does not have is an authoring error.
 */
const comparisonLabel = (
  attribute: string,
  context: ValidationContext | undefined,
): string | undefined => {
  if (!context) return undefined;

  const { stageSubject, codebook, variableLabels } = context;
  invariant(
    getVariableDefinition(codebook, stageSubject, attribute),
    'Comparison attribute not found in codebook',
  );

  if (!variableLabels || !Object.hasOwn(variableLabels, attribute)) {
    return undefined;
  }

  return variableLabels[attribute];
};

/**
 * Require that a value is different from another variable in the same form
 *
 * Short-circuits when either side is unanswered: `required` owns emptiness,
 * and two blanks are not a participant's answers being "the same".
 */
const differentFrom: ValidationFunction<string> =
  (attribute, context) => (formValues) => {
    invariant(
      typeof attribute === 'string',
      'Attribute must be specified for differentFrom validation',
    );

    const label = comparisonLabel(attribute, context);
    const message =
      label === undefined
        ? 'Your answer must be different from your earlier answer.'
        : `Your answer must be different from your answer to '${label}'.`;
    const hint =
      label === undefined
        ? 'Must be different from your earlier answer.'
        : `Must be different from your answer to '${label}'.`;

    return z.unknown().check(
      z.superRefine((value, ctx) => {
        if (isUnanswered(value)) {
          return;
        }
        // Source the comparison value from the current form, falling back to
        // the persisted entity attributes (shared graph). No-op when the
        // variable has no value in either, or holds an empty one.
        const comparison = getComparisonValue(formValues, attribute, context);
        if (!comparison.present || isUnanswered(comparison.value)) {
          return;
        }
        if (isMatchingValue(value, comparison.value)) {
          ctx.addIssue({
            code: 'custom',
            message,
            path: [],
          });
        }
      }),
      z.meta({ hint }),
    );
  };

/**
 * Require that a value be the same as another variable in the same form
 *
 * See note about comparison variables in the `differentFrom` validation.
 */
const sameAs: ValidationFunction<string> =
  (attribute, context) => (formValues) => {
    invariant(
      typeof attribute === 'string',
      'Attribute must be specified for sameAs validation',
    );

    const label = comparisonLabel(attribute, context);
    const message =
      label === undefined
        ? 'Your answer must be the same as your earlier answer.'
        : `Your answer must be the same as your answer to '${label}'.`;
    const hint =
      label === undefined
        ? 'Must be the same as your earlier answer.'
        : `Must be the same as your answer to '${label}'.`;

    return z.unknown().check(
      z.superRefine((value, ctx) => {
        if (isUnanswered(value)) {
          return;
        }
        // Source the comparison value from the current form, falling back to
        // the persisted entity attributes (shared graph). No-op when the
        // variable has no value in either, or holds an empty one.
        const comparison = getComparisonValue(formValues, attribute, context);
        if (!comparison.present || isUnanswered(comparison.value)) {
          return;
        }
        if (!isMatchingValue(value, comparison.value)) {
          ctx.addIssue({
            code: 'custom',
            message,
            path: [],
          });
        }
      }),
      z.meta({ hint }),
    );
  };

/**
 * Require that a value be greater than another variable in the same form
 */
const greaterThanVariable: ValidationFunction<{
  attribute: string;
  type: Variable['type'];
}> = (parameter, context) => (formValues) => {
  const { attribute, type } = parameter;

  invariant(
    typeof attribute === 'string',
    'Attribute must be specified for greaterThanVariable validation',
  );

  invariant(
    typeof type === 'string',
    'Type must be specified for greaterThanVariable validation',
  );

  const label = comparisonLabel(attribute, context);
  const message =
    label === undefined
      ? 'Your answer must be greater than your earlier answer.'
      : `Your answer must be greater than your answer to '${label}'.`;
  const hint =
    label === undefined
      ? 'Must be greater than your earlier answer.'
      : `Must be greater than your answer to '${label}'.`;

  return z.unknown().check(
    z.superRefine((value, ctx) => {
      if (isUnanswered(value)) {
        return;
      }
      // Source the comparison value from the current form, falling back to the
      // persisted entity attributes (shared graph). No-op when the variable
      // has no value in either, or holds an empty one.
      const comparison = getComparisonValue(formValues, attribute, context);
      if (!comparison.present || isUnanswered(comparison.value)) {
        return;
      }
      // Strict comparison: value must be greater than (not equal to) the comparison
      if (compareVariables(value, comparison.value, type) <= 0) {
        ctx.addIssue({
          code: 'too_small',
          minimum: Number(comparison.value),
          inclusive: false,
          origin: type === 'datetime' ? 'date' : 'number',
          message,
          path: [],
        });
      }
    }),
    z.meta({ hint }),
  );
};

/**
 * Require that a value matches a pattern. Designed to mirror the 'pattern'
 * attribute of HTML5 input elements.
 *
 * Short-circuits on an empty/unanswered field, exactly as HTML5 `pattern`
 * does and as every other optional rule in this file does: `required` owns
 * emptiness. The earlier implementation wrapped the regex in
 * `z.prefault(…, '')`, which turned an absent value into an empty string and
 * then tested THAT against the expression — so an empty required field
 * reported "This field is required." AND "Not a valid …" at once, and an
 * empty optional field was rejected outright for being empty.
 */
const pattern: ValidationFunction<{
  regex: string;
  errorMessage: string;
  hint: string;
}> =
  ({ regex, errorMessage, hint }) =>
  () => {
    invariant(regex, 'Regex must be specified');
    invariant(hint, 'Hint must be specified for pattern validation');

    // Built once per schema, not per value: the expression carries no `g`
    // flag, so `test` holds no cursor between calls.
    const expression = new RegExp(regex);

    return z.unknown().check(
      z.superRefine((value, ctx) => {
        if (isUnanswered(value)) return;
        if (typeof value !== 'string') return;
        if (!expression.test(value)) {
          ctx.addIssue({
            code: 'custom',
            input: value,
            message: errorMessage,
            path: [],
          });
        }
      }),
      z.meta({ hint }),
    );
  };

/**
 * Require that a value be less than another variable in the same form
 */
const lessThanVariable: ValidationFunction<{
  attribute: string;
  type: Variable['type'];
}> = (parameter, context) => (formValues) => {
  const { attribute, type } = parameter;

  invariant(
    typeof attribute === 'string',
    'Attribute must be specified for lessThanVariable validation',
  );

  invariant(
    typeof type === 'string',
    'Type must be specified for lessThanVariable validation',
  );

  const label = comparisonLabel(attribute, context);
  const message =
    label === undefined
      ? 'Your answer must be less than your earlier answer.'
      : `Your answer must be less than your answer to '${label}'.`;
  const hint =
    label === undefined
      ? 'Must be less than your earlier answer.'
      : `Must be less than your answer to '${label}'.`;

  return z.unknown().check(
    z.superRefine((value, ctx) => {
      if (isUnanswered(value)) {
        return;
      }
      // Source the comparison value from the current form, falling back to the
      // persisted entity attributes (shared graph). No-op when the variable
      // has no value in either, or holds an empty one.
      const comparison = getComparisonValue(formValues, attribute, context);
      if (!comparison.present || isUnanswered(comparison.value)) {
        return;
      }

      // Strict comparison: value must be less than (not equal to) the comparison
      if (compareVariables(value, comparison.value, type) >= 0) {
        ctx.addIssue({
          code: 'too_big',
          maximum: Number(comparison.value),
          inclusive: false,
          origin: type === 'datetime' ? 'date' : 'number',
          message,
          path: [],
        });
      }
    }),
    z.meta({ hint }),
  );
};

/**
 * Require that a value be greater than or equal to another variable in the same form
 */
const greaterThanOrEqualToVariable: ValidationFunction<{
  attribute: string;
  type: Variable['type'];
}> = (parameter, context) => (formValues) => {
  const { attribute, type } = parameter;

  invariant(
    typeof attribute === 'string',
    'Attribute must be specified for greaterThanOrEqualToVariable validation',
  );

  invariant(
    typeof type === 'string',
    'Type must be specified for greaterThanOrEqualToVariable validation',
  );

  const label = comparisonLabel(attribute, context);
  const message =
    label === undefined
      ? 'Your answer must be the same as or greater than your earlier answer.'
      : `Your answer must be the same as or greater than your answer to '${label}'.`;
  const hint =
    label === undefined
      ? 'Must be the same as or greater than your earlier answer.'
      : `Must be the same as or greater than your answer to '${label}'.`;

  return z.unknown().check(
    z.superRefine((value, ctx) => {
      if (isUnanswered(value)) {
        return;
      }
      // Source the comparison value from the current form, falling back to the
      // persisted entity attributes (shared graph). No-op when the variable
      // has no value in either, or holds an empty one.
      const comparison = getComparisonValue(formValues, attribute, context);
      if (!comparison.present || isUnanswered(comparison.value)) {
        return;
      }
      if (compareVariables(value, comparison.value, type) < 0) {
        ctx.addIssue({
          code: 'too_small',
          minimum: Number(comparison.value),
          inclusive: true,
          origin: type === 'datetime' ? 'date' : 'number',
          message,
          path: [],
        });
      }
    }),
    z.meta({ hint }),
  );
};

/**
 * Require that a value be less than or equal to another variable in the same form
 */
const lessThanOrEqualToVariable: ValidationFunction<{
  attribute: string;
  type: Variable['type'];
}> = (parameter, context) => (formValues) => {
  const { attribute, type } = parameter;

  invariant(
    typeof attribute === 'string',
    'Attribute must be specified for lessThanOrEqualToVariable validation',
  );

  invariant(
    typeof type === 'string',
    'Type must be specified for lessThanOrEqualToVariable validation',
  );

  const label = comparisonLabel(attribute, context);
  const message =
    label === undefined
      ? 'Your answer must be the same as or less than your earlier answer.'
      : `Your answer must be the same as or less than your answer to '${label}'.`;
  const hint =
    label === undefined
      ? 'Must be the same as or less than your earlier answer.'
      : `Must be the same as or less than your answer to '${label}'.`;

  return z.unknown().check(
    z.superRefine((value, ctx) => {
      if (isUnanswered(value)) {
        return;
      }
      // Source the comparison value from the current form, falling back to the
      // persisted entity attributes (shared graph). No-op when the variable
      // has no value in either, or holds an empty one.
      const comparison = getComparisonValue(formValues, attribute, context);
      if (!comparison.present || isUnanswered(comparison.value)) {
        return;
      }

      if (compareVariables(value, comparison.value, type) > 0) {
        ctx.addIssue({
          code: 'too_big',
          maximum: Number(comparison.value),
          inclusive: true,
          origin: type === 'datetime' ? 'date' : 'number',
          message,
          path: [],
        });
      }
    }),
    z.meta({ hint }),
  );
};

/**
 * Require that a value be a valid email address.
 *
 * Short-circuits on `isUnanswered`, exactly as `pattern` does: `required` owns
 * emptiness. The earlier implementation wrapped the address check in
 * `z.prefault(…, '')`, which substituted an empty string for an absent value
 * and then tested THAT — so an untouched optional email field was rejected for
 * being empty, and a required one reported "Enter a valid email address."
 * alongside "You must answer this question before continuing.". A value that
 * is not a string is left alone rather than surfacing Zod's own type error.
 */
const email = () => () => {
  const hint = 'Must be a valid email address.';
  const message = 'Enter a valid email address.';
  const address = z.email(message);

  return z.unknown().check(
    z.superRefine((value, ctx) => {
      if (isUnanswered(value)) return;
      if (typeof value !== 'string') return;
      if (!address.safeParse(value).success) {
        ctx.addIssue({
          code: 'custom',
          input: value,
          message,
          path: [],
        });
      }
    }),
    z.meta({ hint }),
  );
};

const custom = () => () => void 0; // Placeholder for custom validation handled elsewhere

export const validations = {
  email,
  required,
  minLength,
  maxLength,
  pattern,
  min,
  max,
  minValue,
  maxValue,
  minSelected,
  maxSelected,
  unique,
  differentFrom,
  sameAs,
  greaterThanVariable,
  lessThanVariable,
  greaterThanOrEqualToVariable,
  lessThanOrEqualToVariable,
  custom,
};

export const validationPropKeys = Object.keys(
  validations,
) as (keyof typeof validations)[];

export type ValidationPropKey = (typeof validationPropKeys)[number];
