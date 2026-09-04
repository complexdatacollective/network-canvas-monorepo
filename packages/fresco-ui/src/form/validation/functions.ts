import { invariant } from 'es-toolkit';
import { z } from 'zod/mini';

import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import type { Variable } from '@codaco/protocol-validation';

import { resolveIntl } from '../../utils/resolveIntl';
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
  // THE LOCALIZATION SEAM. Every participant-facing string below is a message
  // descriptor formatted at schema-construction time with this formatter —
  // the field layer (useField) threads its ambient `useAppIntl()` instance
  // through `makeValidationFunction`/`makeValidationHints`, so a localized
  // host gets localized copy while the strings that then flow through the
  // form store, `onSubmitInvalid`, and Zod issues stay plain strings and the
  // rule signature stays callable without it. Absent (external callers, the
  // provider-less default), messages render their English defaultMessage —
  // byte-identical to the pre-conversion literals.
  intl?: IntlShape,
) => (formValues: Record<string, FieldValue>) => z.ZodMiniType;

// A number written as `{x, number}` is formatted in the locale of the message
// it sits in; a bare `{x}` is interpolated with `String(value)`, so its digits
// and grouping stay as the source language wrote them however the sentence
// around it reads. Character counts are quantities and take the typed form.
// The value bounds below deliberately do not: `min`/`max` echo a number the
// protocol author supplied, which need not be a quantity at all — a year, a
// score, an identifier — and is the literal the participant has to type back.
// "greater than or equal to 1,990" would be a rule about a different number.
const messages = defineMessages({
  required: {
    id: 'frescoUi.validation.required',
    defaultMessage: 'You must answer this question before continuing.',
    description: 'Error shown when a required form field is left unanswered.',
  },
  maxLengthHint: {
    id: 'frescoUi.validation.maxLengthHint',
    defaultMessage: 'Enter at most {max, number} characters.',
    description: 'Hint summarising a maximum text length rule.',
  },
  maxLengthError: {
    id: 'frescoUi.validation.maxLengthError',
    defaultMessage: 'Too long. Enter fewer than {max, number} characters.',
    description: 'Error shown when text exceeds its maximum length.',
  },
  minLengthHint: {
    id: 'frescoUi.validation.minLengthHint',
    defaultMessage: 'Enter at least {min, number} characters.',
    description: 'Hint summarising a minimum text length rule.',
  },
  minLengthError: {
    id: 'frescoUi.validation.minLengthError',
    defaultMessage: 'Too short. Enter at least {min, number} characters.',
    description: 'Error shown when text is shorter than its minimum length.',
  },
  minValueHint: {
    id: 'frescoUi.validation.minValueHint',
    defaultMessage: 'Enter a value greater than or equal to {min}.',
    description: 'Hint summarising a numeric minimum rule.',
  },
  minValueError: {
    id: 'frescoUi.validation.minValueError',
    defaultMessage: 'Too small. Value must be at least {min}.',
    description: 'Error shown when a number is below its minimum.',
  },
  maxValueHint: {
    id: 'frescoUi.validation.maxValueHint',
    defaultMessage: 'Enter a value less than or equal to {max}.',
    description: 'Hint summarising a numeric maximum rule.',
  },
  maxValueError: {
    id: 'frescoUi.validation.maxValueError',
    defaultMessage: 'Too large. Value must be at most {max}.',
    description: 'Error shown when a number is above its maximum.',
  },
  minDate: {
    id: 'frescoUi.validation.minDate',
    defaultMessage: 'Must be on or after {min}.',
    description:
      'Hint and error for a date/time minimum; {min} is the formatted bound.',
  },
  maxDate: {
    id: 'frescoUi.validation.maxDate',
    defaultMessage: 'Must be on or before {max}.',
    description:
      'Hint and error for a date/time maximum; {max} is the formatted bound.',
  },
  minSelectedHint: {
    id: 'frescoUi.validation.minSelectedHint',
    defaultMessage:
      '{count, plural, one {Select at least # value.} other {Select at least # values.}}',
    description: 'Hint summarising a minimum selection-count rule.',
  },
  minSelectedError: {
    id: 'frescoUi.validation.minSelectedError',
    defaultMessage:
      '{count, plural, one {Too few selected. Select at least # value.} other {Too few selected. Select at least # values.}}',
    description: 'Error shown when too few options are selected.',
  },
  maxSelectedHint: {
    id: 'frescoUi.validation.maxSelectedHint',
    defaultMessage:
      '{count, plural, one {Select a maximum of # value.} other {Select a maximum of # values.}}',
    description: 'Hint summarising a maximum selection-count rule.',
  },
  maxSelectedError: {
    id: 'frescoUi.validation.maxSelectedError',
    defaultMessage:
      '{count, plural, one {Too many items selected. Select a maximum of # value.} other {Too many items selected. Select a maximum of # values.}}',
    description: 'Error shown when too many options are selected.',
  },
  uniqueHint: {
    id: 'frescoUi.validation.uniqueHint',
    defaultMessage: 'Must be unique.',
    description: 'Hint summarising a uniqueness rule.',
  },
  uniqueError: {
    id: 'frescoUi.validation.uniqueError',
    defaultMessage: 'This value is used elsewhere. It must be unique.',
    description: 'Error shown when a value duplicates one used elsewhere.',
  },
  differentFromError: {
    id: 'frescoUi.validation.differentFromError',
    defaultMessage: 'Your answer must be different from your earlier answer.',
    description:
      'Error for a must-differ comparison when the other answer has no visible label.',
  },
  differentFromLabelledError: {
    id: 'frescoUi.validation.differentFromLabelledError',
    defaultMessage:
      "Your answer must be different from your answer to ''{label}''.",
    description:
      'Error for a must-differ comparison naming the other question.',
  },
  differentFromHint: {
    id: 'frescoUi.validation.differentFromHint',
    defaultMessage: 'Must be different from your earlier answer.',
    description:
      'Hint for a must-differ comparison when the other answer has no visible label.',
  },
  differentFromLabelledHint: {
    id: 'frescoUi.validation.differentFromLabelledHint',
    defaultMessage: "Must be different from your answer to ''{label}''.",
    description: 'Hint for a must-differ comparison naming the other question.',
  },
  sameAsError: {
    id: 'frescoUi.validation.sameAsError',
    defaultMessage: 'Your answer must be the same as your earlier answer.',
    description:
      'Error for a must-match comparison when the other answer has no visible label.',
  },
  sameAsLabelledError: {
    id: 'frescoUi.validation.sameAsLabelledError',
    defaultMessage:
      "Your answer must be the same as your answer to ''{label}''.",
    description: 'Error for a must-match comparison naming the other question.',
  },
  sameAsHint: {
    id: 'frescoUi.validation.sameAsHint',
    defaultMessage: 'Must be the same as your earlier answer.',
    description:
      'Hint for a must-match comparison when the other answer has no visible label.',
  },
  sameAsLabelledHint: {
    id: 'frescoUi.validation.sameAsLabelledHint',
    defaultMessage: "Must be the same as your answer to ''{label}''.",
    description: 'Hint for a must-match comparison naming the other question.',
  },
  greaterThanError: {
    id: 'frescoUi.validation.greaterThanError',
    defaultMessage: 'Your answer must be greater than your earlier answer.',
    description:
      'Error for a must-be-greater comparison when the other answer has no visible label.',
  },
  greaterThanLabelledError: {
    id: 'frescoUi.validation.greaterThanLabelledError',
    defaultMessage:
      "Your answer must be greater than your answer to ''{label}''.",
    description:
      'Error for a must-be-greater comparison naming the other question.',
  },
  greaterThanHint: {
    id: 'frescoUi.validation.greaterThanHint',
    defaultMessage: 'Must be greater than your earlier answer.',
    description:
      'Hint for a must-be-greater comparison when the other answer has no visible label.',
  },
  greaterThanLabelledHint: {
    id: 'frescoUi.validation.greaterThanLabelledHint',
    defaultMessage: "Must be greater than your answer to ''{label}''.",
    description:
      'Hint for a must-be-greater comparison naming the other question.',
  },
  lessThanError: {
    id: 'frescoUi.validation.lessThanError',
    defaultMessage: 'Your answer must be less than your earlier answer.',
    description:
      'Error for a must-be-less comparison when the other answer has no visible label.',
  },
  lessThanLabelledError: {
    id: 'frescoUi.validation.lessThanLabelledError',
    defaultMessage: "Your answer must be less than your answer to ''{label}''.",
    description:
      'Error for a must-be-less comparison naming the other question.',
  },
  lessThanHint: {
    id: 'frescoUi.validation.lessThanHint',
    defaultMessage: 'Must be less than your earlier answer.',
    description:
      'Hint for a must-be-less comparison when the other answer has no visible label.',
  },
  lessThanLabelledHint: {
    id: 'frescoUi.validation.lessThanLabelledHint',
    defaultMessage: "Must be less than your answer to ''{label}''.",
    description:
      'Hint for a must-be-less comparison naming the other question.',
  },
  greaterThanOrEqualError: {
    id: 'frescoUi.validation.greaterThanOrEqualError',
    defaultMessage:
      'Your answer must be the same as or greater than your earlier answer.',
    description:
      'Error for a must-be-at-least comparison when the other answer has no visible label.',
  },
  greaterThanOrEqualLabelledError: {
    id: 'frescoUi.validation.greaterThanOrEqualLabelledError',
    defaultMessage:
      "Your answer must be the same as or greater than your answer to ''{label}''.",
    description:
      'Error for a must-be-at-least comparison naming the other question.',
  },
  greaterThanOrEqualHint: {
    id: 'frescoUi.validation.greaterThanOrEqualHint',
    defaultMessage: 'Must be the same as or greater than your earlier answer.',
    description:
      'Hint for a must-be-at-least comparison when the other answer has no visible label.',
  },
  greaterThanOrEqualLabelledHint: {
    id: 'frescoUi.validation.greaterThanOrEqualLabelledHint',
    defaultMessage:
      "Must be the same as or greater than your answer to ''{label}''.",
    description:
      'Hint for a must-be-at-least comparison naming the other question.',
  },
  lessThanOrEqualError: {
    id: 'frescoUi.validation.lessThanOrEqualError',
    defaultMessage:
      'Your answer must be the same as or less than your earlier answer.',
    description:
      'Error for a must-be-at-most comparison when the other answer has no visible label.',
  },
  lessThanOrEqualLabelledError: {
    id: 'frescoUi.validation.lessThanOrEqualLabelledError',
    defaultMessage:
      "Your answer must be the same as or less than your answer to ''{label}''.",
    description:
      'Error for a must-be-at-most comparison naming the other question.',
  },
  lessThanOrEqualHint: {
    id: 'frescoUi.validation.lessThanOrEqualHint',
    defaultMessage: 'Must be the same as or less than your earlier answer.',
    description:
      'Hint for a must-be-at-most comparison when the other answer has no visible label.',
  },
  lessThanOrEqualLabelledHint: {
    id: 'frescoUi.validation.lessThanOrEqualLabelledHint',
    defaultMessage:
      "Must be the same as or less than your answer to ''{label}''.",
    description:
      'Hint for a must-be-at-most comparison naming the other question.',
  },
  emailHint: {
    id: 'frescoUi.validation.emailHint',
    defaultMessage: 'Must be a valid email address.',
    description: 'Hint summarising an email-format rule.',
  },
  emailError: {
    id: 'frescoUi.validation.emailError',
    defaultMessage: 'Enter a valid email address.',
    description: 'Error shown when a value is not a valid email address.',
  },
});

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
export const required =
  (
    parameter?: boolean | string,
    _context?: ValidationContext,
    intl?: IntlShape,
  ) =>
  () => {
    if (parameter === false) {
      return z.unknown();
    }

    const message =
      typeof parameter === 'string'
        ? parameter
        : resolveIntl(intl).formatMessage(messages.required);

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
const maxLength: ValidationFunction<number> = (max, _context, intl) => () => {
  invariant(
    typeof max === 'number' && !Number.isNaN(max),
    'Max length must be specified',
  );

  const hint = resolveIntl(intl).formatMessage(messages.maxLengthHint, {
    max,
  });

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
          message: resolveIntl(intl).formatMessage(messages.maxLengthError, {
            max,
          }),
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
const minLength: ValidationFunction<number> = (min, _context, intl) => () => {
  invariant(
    typeof min === 'number' && !Number.isNaN(min),
    'Min length must be specified',
  );

  const hint = resolveIntl(intl).formatMessage(messages.minLengthHint, {
    min,
  });

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
          message: resolveIntl(intl).formatMessage(messages.minLengthError, {
            min,
          }),
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
const minValue: ValidationFunction<number> = (min, _context, intl) => () => {
  invariant(
    typeof min === 'number' && !Number.isNaN(min),
    'Min value must be specified',
  );

  const hint = resolveIntl(intl).formatMessage(messages.minValueHint, {
    min,
  });

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
          message: resolveIntl(intl).formatMessage(messages.minValueError, {
            min,
          }),
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
const maxValue: ValidationFunction<number> = (max, _context, intl) => () => {
  invariant(
    typeof max === 'number' && !Number.isNaN(max),
    'Max value must be specified',
  );

  const hint = resolveIntl(intl).formatMessage(messages.maxValueHint, {
    max,
  });

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
          message: resolveIntl(intl).formatMessage(messages.maxValueError, {
            max,
          }),
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
 *
 * Formats through the same `intl` that renders the message the bound is
 * substituted into, rather than through the runtime's own default locale:
 * the two are not the same thing once a host mounts a provider, and a bound
 * formatted by the browser's default lands inside a sentence written in the
 * app's locale — an en-GB interface on an en-US machine would say "Must be on
 * or after June 15, 2000." in US date order.
 *
 * `timeZone: 'UTC'` keeps the formatted date equal to the literal YYYY-MM-DD
 * bound regardless of the viewer's timezone, and `calendar: 'gregory'` keeps
 * it equal to the same literal under a locale that defaults to another
 * calendar: the bound describes a rule about a Gregorian ISO value the
 * DatePicker offers in Gregorian years, so a hint reading "on or after 15
 * June 2543" would be about a date the field cannot hold. The bare-year
 * branch above already returns its four digits verbatim for the same reason.
 *
 * Returns the raw string for values we don't recognise as date/time literals.
 */
function formatBoundForDisplay(bound: string, intl: IntlShape): string {
  if (YEAR_RE.test(bound)) return bound;

  const yearMonth = YEAR_MONTH_RE.exec(bound);
  if (yearMonth) {
    const year = Number(yearMonth[1]);
    const month = Number(yearMonth[2]);
    return intl.formatDate(utcDateFromParts(year, month, 1), {
      year: 'numeric',
      month: 'long',
      timeZone: 'UTC',
      calendar: 'gregory',
    });
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
      return intl.formatDate(date, {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'UTC',
        calendar: 'gregory',
      });
    }
    return intl.formatDate(utcDateFromParts(year, month, day), {
      dateStyle: 'long',
      timeZone: 'UTC',
      calendar: 'gregory',
    });
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
    return intl.formatTime(anchor, {
      timeStyle: 'short',
      timeZone: 'UTC',
    });
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
const min: ValidationFunction<number | string> =
  (minParam, _context, intl) => () => {
    invariant(
      minParam !== undefined && minParam !== null && minParam !== '',
      'Min must be specified',
    );

    const paramIsDateShaped =
      typeof minParam === 'string' && matchesDatePattern(minParam);
    const displayMin = paramIsDateShaped
      ? formatBoundForDisplay(minParam, resolveIntl(intl))
      : String(minParam);
    const hint = paramIsDateShaped
      ? resolveIntl(intl).formatMessage(messages.minDate, {
          min: displayMin,
        })
      : resolveIntl(intl).formatMessage(messages.minValueHint, {
          min: displayMin,
        });

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
              message: resolveIntl(intl).formatMessage(messages.minDate, {
                min: displayMin,
              }),
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
            message: resolveIntl(intl).formatMessage(messages.minValueError, {
              min: displayMin,
            }),
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
const max: ValidationFunction<number | string> =
  (maxParam, _context, intl) => () => {
    invariant(
      maxParam !== undefined && maxParam !== null && maxParam !== '',
      'Max must be specified',
    );

    const paramIsDateShaped =
      typeof maxParam === 'string' && matchesDatePattern(maxParam);
    const displayMax = paramIsDateShaped
      ? formatBoundForDisplay(maxParam, resolveIntl(intl))
      : String(maxParam);
    const hint = paramIsDateShaped
      ? resolveIntl(intl).formatMessage(messages.maxDate, {
          max: displayMax,
        })
      : resolveIntl(intl).formatMessage(messages.maxValueHint, {
          max: displayMax,
        });

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
              message: resolveIntl(intl).formatMessage(messages.maxDate, {
                max: displayMax,
              }),
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
            message: resolveIntl(intl).formatMessage(messages.maxValueError, {
              max: displayMax,
            }),
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
const minSelected: ValidationFunction<number> =
  (minParam, _context, intl) => () => {
    invariant(typeof minParam === 'number', 'Min items must be specified');

    const hint = resolveIntl(intl).formatMessage(messages.minSelectedHint, {
      count: minParam,
    });

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
            message: resolveIntl(intl).formatMessage(
              messages.minSelectedError,
              { count: minParam },
            ),
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
const maxSelected: ValidationFunction<number> =
  (maxParam, _context, intl) => () => {
    invariant(typeof maxParam === 'number', 'Max items must be specified');

    const hint = resolveIntl(intl).formatMessage(messages.maxSelectedHint, {
      count: maxParam,
    });

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
            message: resolveIntl(intl).formatMessage(
              messages.maxSelectedError,
              { count: maxParam },
            ),
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
const unique: ValidationFunction<string> = (attribute, context, intl) => () => {
  invariant(
    context,
    'Validation context must be provided when using unique validation',
  );
  const { stageSubject, network, currentEntityId } = context;

  const hint = resolveIntl(intl).formatMessage(messages.uniqueHint);

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
          message: resolveIntl(intl).formatMessage(messages.uniqueError),
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
 * Message + hint for one comparison rule: the label-free sentences when the
 * target has no participant-facing label, the labelled ones otherwise.
 */
const comparisonCopy = (
  intl: IntlShape,
  label: string | undefined,
  copy: {
    error: (typeof messages)[keyof typeof messages];
    hint: (typeof messages)[keyof typeof messages];
    labelledError: (typeof messages)[keyof typeof messages];
    labelledHint: (typeof messages)[keyof typeof messages];
  },
): { message: string; hint: string } =>
  label === undefined
    ? {
        message: intl.formatMessage(copy.error),
        hint: intl.formatMessage(copy.hint),
      }
    : {
        message: intl.formatMessage(copy.labelledError, { label }),
        hint: intl.formatMessage(copy.labelledHint, { label }),
      };

/**
 * Require that a value is different from another variable in the same form
 *
 * Short-circuits when either side is unanswered: `required` owns emptiness,
 * and two blanks are not a participant's answers being "the same".
 */
const differentFrom: ValidationFunction<string> =
  (attribute, context, intl) => (formValues) => {
    invariant(
      typeof attribute === 'string',
      'Attribute must be specified for differentFrom validation',
    );

    const label = comparisonLabel(attribute, context);
    const { message, hint } = comparisonCopy(resolveIntl(intl), label, {
      error: messages.differentFromError,
      hint: messages.differentFromHint,
      labelledError: messages.differentFromLabelledError,
      labelledHint: messages.differentFromLabelledHint,
    });

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
  (attribute, context, intl) => (formValues) => {
    invariant(
      typeof attribute === 'string',
      'Attribute must be specified for sameAs validation',
    );

    const label = comparisonLabel(attribute, context);
    const { message, hint } = comparisonCopy(resolveIntl(intl), label, {
      error: messages.sameAsError,
      hint: messages.sameAsHint,
      labelledError: messages.sameAsLabelledError,
      labelledHint: messages.sameAsLabelledHint,
    });

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
}> = (parameter, context, intl) => (formValues) => {
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
  const { message, hint } = comparisonCopy(resolveIntl(intl), label, {
    error: messages.greaterThanError,
    hint: messages.greaterThanHint,
    labelledError: messages.greaterThanLabelledError,
    labelledHint: messages.greaterThanLabelledHint,
  });

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
}> = (parameter, context, intl) => (formValues) => {
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
  const { message, hint } = comparisonCopy(resolveIntl(intl), label, {
    error: messages.lessThanError,
    hint: messages.lessThanHint,
    labelledError: messages.lessThanLabelledError,
    labelledHint: messages.lessThanLabelledHint,
  });

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
}> = (parameter, context, intl) => (formValues) => {
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
  const { message, hint } = comparisonCopy(resolveIntl(intl), label, {
    error: messages.greaterThanOrEqualError,
    hint: messages.greaterThanOrEqualHint,
    labelledError: messages.greaterThanOrEqualLabelledError,
    labelledHint: messages.greaterThanOrEqualLabelledHint,
  });

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
}> = (parameter, context, intl) => (formValues) => {
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
  const { message, hint } = comparisonCopy(resolveIntl(intl), label, {
    error: messages.lessThanOrEqualError,
    hint: messages.lessThanOrEqualHint,
    labelledError: messages.lessThanOrEqualLabelledError,
    labelledHint: messages.lessThanOrEqualLabelledHint,
  });

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
const email =
  (
    _parameter?: ValidationParameter,
    _context?: ValidationContext,
    intl?: IntlShape,
  ) =>
  () => {
    const hint = resolveIntl(intl).formatMessage(messages.emailHint);
    const message = resolveIntl(intl).formatMessage(messages.emailError);
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
