import {
  VARIABLE_REFERENCE_VALIDATIONS,
  type Variables,
} from '@codaco/protocol-validation';
import {
  RELATIVE_DATE_PICKER_DEFAULT_AFTER,
  RELATIVE_DATE_PICKER_DEFAULT_BEFORE,
} from '@codaco/shared-consts';

import type { VariableEntry } from '../../types';
import { toVariableEntry } from '../attributes';
import {
  addDays,
  type DateResolution,
  type DateWindow,
  EARLIEST_OFFERED_DATE,
  truncateToResolution,
  utcDate,
} from './dateWindow';
import type { EntityConstraints, VariableConstraints } from './types';
import { SCALAR_DOMAIN } from './valueSpace';

function readNumber(
  source: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = source?.[key];
  return typeof value === 'number' ? value : undefined;
}

function readString(
  source: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(
  source: Record<string, unknown> | undefined,
  key: string,
): boolean {
  return source?.[key] === true;
}

/** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, before the calendar is consulted. */
const CALENDAR_BOUND = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/;

/**
 * How a date is written at each resolution. The length doubles as the ordering:
 * a shorter bound is a coarser one.
 */
const RESOLUTION_SHAPE = {
  year: 'YYYY',
  month: 'YYYY-MM',
  full: 'YYYY-MM-DD',
} as const satisfies Record<DateResolution, string>;

const RESOLUTIONS: readonly DateResolution[] = ['year', 'month', 'full'];

/**
 * The earliest year each picker can offer, read from the one table that states
 * it. A bound the protocol *declares* is refused below this year; a floor the
 * generator *derives* is clamped to it. Those are separate escapes, but they
 * are the same fact about the control, so they are not written down twice.
 */
function earliestOfferedYear(resolution: DateResolution): number {
  return Number(EARLIEST_OFFERED_DATE[resolution].slice(0, 4));
}

/**
 * The resolution a bound is written at, or `undefined` where it names no date.
 */
function boundResolution(value: string): DateResolution | undefined {
  if (!CALENDAR_BOUND.test(value)) return undefined;

  const [year, month = '01', day = '01'] = value.split('-');
  const date = utcDate(Number(year), Number(month), Number(day));
  // A day the calendar does not hold rolls forward rather than failing, so the
  // parsed date is compared back against what was written — the year included,
  // which is what distinguishes a real leap day in a low year from one the
  // calendar refuses.
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return undefined;
  }

  return RESOLUTIONS.find(
    (candidate) => RESOLUTION_SHAPE[candidate].length === value.length,
  );
}

/**
 * A picker parameter that names a real date, written no coarser than the date
 * the picker collects.
 *
 * The variable schema accepts an arbitrary string here, so an imported protocol
 * can carry `max: "not-a-date"` or a day no month holds. Such a bound reaches
 * `stepsBetween` as `NaN`, and neither half of the machinery notices: the count
 * reports `NaN` values, which every feasibility comparison reads as satisfied,
 * and the draw then writes `0NaN-NaN-NaN` into the network.
 *
 * A bound that is a real date but coarser than the picker's own resolution —
 * `min: "2020"` on a full-date picker — fails the same way one step later. The
 * window keeps it verbatim (`truncateToResolution` only ever slices, so it has
 * nothing to add), and the draw's arithmetic reads it through `split('-')`:
 * `addDays` finds no month or day to advance and hands the incomplete string
 * straight back, so every offset in the window draws the literal `"2020"` — a
 * value the native full-date input cannot display and no participant could
 * have entered.
 *
 * Both are refused here by variable name rather than repaired. Completing a
 * coarse bound would invent precision nobody wrote, and the two ends would have
 * to invent it in opposite directions (a floor to January 1st, a ceiling to
 * December 31st). The protocol schema is where that judgement belongs: it
 * rejects a bound coarser than its picker, and its migration deletes one rather
 * than filling it in, so a coarse bound arriving here is one no validated
 * protocol carries.
 *
 * The year is held to what the picker can offer for the same reason, at the
 * floor that picker's own control sets. A full date in a low year is one the
 * native input renders and the arithmetic here builds literally, so
 * `0099-01-01` is kept and only year zero — earlier than any date that input
 * accepts — is refused. The `<select>` the other two resolutions render lists
 * its years unpadded, so anything below year 1000 names an option nobody can
 * pick.
 */
function requireCalendarBound(
  entry: VariableEntry,
  parameter: string,
  value: string,
  resolution: DateResolution,
): string {
  const written = boundResolution(value);

  if (written === undefined) {
    throw new Error(
      `Date variable "${entry.name}" (${entry.id}) declares ${parameter} "${value}", which is not a calendar date. ` +
        'Synthetic data generation needs a date written as YYYY, YYYY-MM or YYYY-MM-DD.',
    );
  }

  // Only a bound coarser than its own picker is refused. One written at the
  // picker's own resolution is kept verbatim on purpose: `DatePickerField`
  // parses `YYYY`, `YYYY-MM` and `YYYY-MM-DD` alike (its `ymdPattern` defaults
  // the missing components to 1), and its `<select>` stringifies each year and
  // month from the parsed parts, so `min: "2030"` on a year picker really does
  // offer 2030 and `min: "2030-05"` on a month picker really does offer May
  // (fresco-ui's DatePicker tests, "year mode — partial YYYY bounds" and
  // "month mode — partial YYYY-MM bounds"). Protocols in the wild carry these:
  // `transnational-networks` declares `min: "1940"` on a year picker. Refusing
  // them would turn a field that works today into a protocol generation cannot
  // preview.
  if (RESOLUTION_SHAPE[written].length < RESOLUTION_SHAPE[resolution].length) {
    throw new Error(
      `Date variable "${entry.name}" (${entry.id}) declares ${parameter} "${value}", which is coarser than the date its picker collects. ` +
        `Synthetic data generation needs a bound written as ${RESOLUTION_SHAPE[resolution]}.`,
    );
  }

  const earliest = earliestOfferedYear(resolution);
  if (Number(value.slice(0, 4)) < earliest) {
    throw new Error(
      `Date variable "${entry.name}" (${entry.id}) declares ${parameter} "${value}", whose year is earlier than its picker can offer. ` +
        `Synthetic data generation needs a year of ${String(earliest).padStart(4, '0')} or later.`,
    );
  }

  return value;
}

function resolveDateWindow(
  entry: VariableEntry,
  today: string,
): DateWindow | undefined {
  if (entry.type !== 'datetime') return undefined;

  const parameters = entry.parameters;

  if (entry.component === 'RelativeDatePicker') {
    // The field's own defaults, which useProtocolForm turns into hard min/max
    // validators: a generated value outside this window fails validation even
    // though the protocol declares no explicit bound. Its offsets are counted
    // in days from the anchor, so only a full date anchors it — a coarser one
    // leaves `addDays` nothing to advance and collapses the window onto itself.
    const declaredAnchor = readString(parameters, 'anchor');
    const anchor =
      declaredAnchor !== undefined
        ? requireCalendarBound(entry, 'anchor', declaredAnchor, 'full')
        : today;
    const before =
      readNumber(parameters, 'before') ?? RELATIVE_DATE_PICKER_DEFAULT_BEFORE;
    const after =
      readNumber(parameters, 'after') ?? RELATIVE_DATE_PICKER_DEFAULT_AFTER;
    return {
      resolution: 'full',
      min: addDays(anchor, -before),
      max: addDays(anchor, after),
    };
  }

  const resolutionParameter = readString(parameters, 'type');
  const resolution: DateResolution =
    resolutionParameter === 'month' || resolutionParameter === 'year'
      ? resolutionParameter
      : 'full';

  const declared = {
    min: readString(parameters, 'min'),
    max: readString(parameters, 'max'),
  };
  const min =
    declared.min !== undefined
      ? truncateToResolution(
          requireCalendarBound(entry, 'min', declared.min, resolution),
          resolution,
        )
      : undefined;
  // DatePicker offers no date after today when the protocol declares no maximum
  // (its own `maxYmd` fallback), and the draw already ceilings an open window
  // there. Closing the window here rather than at the draw is what lets
  // `valueSpaceSize` count it: the count has to stay a pure function of the
  // descriptor, or a seeded run would stop reproducing across midnight.
  //
  // Where the protocol declares a floor later than today, what that ceiling
  // does next is the one thing the three resolutions disagree about, because
  // only two of them render a control that stops at today.
  //
  // A month- or year-resolution field is a `<select>`, whose options are built
  // by counting years down from the ceiling to the floor: a floor above it
  // leaves the control offering nothing at all, so the ceiling holds and the
  // window is left inverted. Raising it would generate the one date nobody can
  // select or display. Left inverted, feasibility reports the empty range under
  // the variable's own name.
  //
  // A full-resolution field is a native `<input type="date">`, handed the
  // declared bound verbatim: with no maximum declared it carries no `max`
  // attribute, and `buildDatePickerBoundProps` gives the interview's validators
  // none either, so every date from the floor onward is one a participant can
  // select and submit. Refusing such a field as an empty range would block a
  // preview of a protocol nothing is wrong with, so the floor raises the
  // ceiling to meet it. It rises exactly that far and no further because that
  // is where the draw stops: `ValueGenerator` ceilings an open window at today
  // too, so a floor above today leaves it a span of zero and the floor itself
  // is the only date it writes. A wider window would be a count of values
  // nothing can reach, and this descriptor's window is the one the draw walks.
  const latestOffered = truncateToResolution(today, resolution);
  const openCeiling =
    resolution === 'full' && min !== undefined && min > latestOffered
      ? min
      : latestOffered;

  const max =
    declared.max !== undefined
      ? truncateToResolution(
          requireCalendarBound(entry, 'max', declared.max, resolution),
          resolution,
        )
      : openCeiling;

  return {
    resolution,
    ...(min !== undefined ? { min } : {}),
    max,
  };
}

/**
 * The bounds a value is drawn between.
 *
 * A scalar takes the normalised scale it is recorded on rather than anything
 * the protocol declares. The schema accepts no `minValue`/`maxValue` on the
 * type, and `VisualAnalogScale` renders its slider over 0-1 whatever a protocol
 * says, so a draft carrying a leftover pair describes a range the interview
 * would not collect and the preview could not show. Giving the domain to the
 * constraint descriptor rather than defaulting to it at each draw is what lets
 * the comparator machinery see a scalar as bounded: without it every scalar
 * carrying a comparison rule reaches propagation with nothing to narrow, and a
 * chain of them steps straight out of the scale.
 */
function resolveValueBounds(
  entry: VariableEntry,
  validation: Record<string, unknown> | undefined,
): Pick<VariableConstraints, 'minValue' | 'maxValue'> {
  if (entry.type === 'scalar') return { ...SCALAR_DOMAIN };

  return {
    minValue: readNumber(validation, 'minValue'),
    maxValue: readNumber(validation, 'maxValue'),
  };
}

type ReferenceRule = (typeof VARIABLE_REFERENCE_VALIDATIONS)[number];

/**
 * Every rule whose value names another variable, read from the schema's own
 * canonical list rather than from a copy of it. A reference rule added to the
 * schema arrives here on its own, and one this descriptor has no home for is a
 * type error rather than a rule the generator silently ignores.
 */
function readVariableReferences(
  validation: Record<string, unknown> | undefined,
): Pick<VariableConstraints, ReferenceRule> {
  const references: Pick<VariableConstraints, ReferenceRule> = {};

  for (const rule of VARIABLE_REFERENCE_VALIDATIONS) {
    references[rule] = readString(validation, rule);
  }

  return references;
}

export function buildVariableConstraints(
  entry: VariableEntry,
  today: string,
): VariableConstraints {
  const validation = entry.validation;

  return {
    required: readBoolean(validation, 'required'),
    unique: readBoolean(validation, 'unique'),
    minLength: readNumber(validation, 'minLength'),
    maxLength: readNumber(validation, 'maxLength'),
    ...resolveValueBounds(entry, validation),
    minSelected: readNumber(validation, 'minSelected'),
    maxSelected: readNumber(validation, 'maxSelected'),
    ...readVariableReferences(validation),
    dateWindow: resolveDateWindow(entry, today),
  };
}

/**
 * The same entry with its declared validation rules dropped, leaving only what
 * the variable's type and input control imply (a scalar's unit domain, a date
 * picker's window). Used for a variable nothing validates: the value still has
 * to be one the type can hold, but no rule applies to it.
 */
function withoutValidation(entry: VariableEntry): VariableEntry {
  const { validation: _validation, ...rest } = entry;
  return rest;
}

/**
 * Every variable of one entity type, paired with the constraints a generated
 * value must satisfy.
 *
 * `unvalidated` names variables whose declared rules the interview never
 * applies — see `collectBinOnlyVariables`. They stay in the map, so the
 * generator still produces a value for each, but carry no rules: feasibility
 * then finds nothing to conflict over, and the draw cannot exhaust a value
 * space it was never meant to honour. Omitting the argument analyses every
 * variable, which is the stricter reading rather than a laxer one.
 */
export function buildEntityConstraints(
  variables: Variables | undefined,
  today: string,
  unvalidated: ReadonlySet<string> = new Set(),
): EntityConstraints {
  const result: EntityConstraints = new Map();
  if (!variables) return result;

  for (const [varId, variable] of Object.entries(variables)) {
    const entry = toVariableEntry(varId, variable);
    result.set(varId, {
      entry,
      constraints: buildVariableConstraints(
        unvalidated.has(varId) ? withoutValidation(entry) : entry,
        today,
      ),
    });
  }

  return result;
}
