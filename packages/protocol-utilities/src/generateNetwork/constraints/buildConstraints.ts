import {
  VARIABLE_REFERENCE_VALIDATIONS,
  type Variables,
} from '@codaco/protocol-validation';
import {
  DATE_PICKER_DEFAULT_MIN,
  DATE_PICKER_LATEST_DATE,
  dateWithinPickerRange,
  RELATIVE_DATE_PICKER_DEFAULT_AFTER,
  RELATIVE_DATE_PICKER_DEFAULT_BEFORE,
} from '@codaco/shared-consts';

import type { VariableEntry } from '../../types';
import { toVariableEntry } from '../attributes';
import {
  boundResolution,
  type DateResolution,
  type DateWindow,
  EARLIEST_OFFERED_DATE,
  pickerBoundResolution,
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

/**
 * How a date is written at each resolution. The length doubles as the ordering:
 * a shorter bound is a coarser one.
 */
const RESOLUTION_SHAPE = {
  year: 'YYYY',
  month: 'YYYY-MM',
  full: 'YYYY-MM-DD',
} as const satisfies Record<DateResolution, string>;

const DATE_PICKER_DEFAULT_MIN_YEAR = Number(
  DATE_PICKER_DEFAULT_MIN.slice(0, 4),
);
const COARSE_DATE_PICKER_MIN_YEAR = 1000;
const COARSE_DATE_PICKER_MAX_YEAR = Number(DATE_PICKER_LATEST_DATE.slice(0, 4));

/** Which end of a window a declared bound closes. */
type BoundEnd = 'floor' | 'ceiling';

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
 * A picker parameter that names a real date the picker can offer, and the
 * resolution it was written at.
 *
 * The variable schema accepts an arbitrary string here — `min: z.string()
 * .optional()` on `dateTimeDatePickerSchema`, with no refinement over it and no
 * migration that touches the parameter — so an imported protocol can carry
 * `max: "not-a-date"` or a day no month holds. Such a bound reaches
 * `stepsBetween` as `NaN`, and neither half of the machinery notices: the count
 * reports `NaN` values, which every feasibility comparison reads as satisfied,
 * and the draw then writes `0NaN-NaN-NaN` into the network. Refused here by
 * variable name, because a bound the generator cannot read is one it cannot
 * guess the intent of either.
 *
 * The calendar is consulted over the components the picker renders, and only
 * those. A bound finer than its picker carries components neither the control
 * nor the validator ever reads: a month picker's `<select>`s take the year and
 * month `ymdPattern` parsed and nothing else, while `compareDateStrings`
 * truncates the bound to the submitted value's length before comparing. So
 * `type: "month"` with `min: "2020-02-31"` is a February 2020 floor to both, and
 * is kept as one — refusing February 31 there would refuse a field that collects
 * dates perfectly well. The same bound on a full picker does name the day, and
 * is still refused: what truncation discards is components finer than the
 * picker's own resolution, never the resolution it collects at.
 *
 * What the control can read at all is a separate question, asked over the whole
 * string at every resolution — {@link pickerBoundResolution}. A component
 * outside its parser's ranges leaves the field on its default bound while the
 * validator keeps enforcing the declared string, so `2020-13-01` is refused by a
 * year picker that would otherwise never have looked at the month.
 *
 * The year is held to what the picker can offer, at the floor that picker's own
 * control sets. A full date in a low year is one the native input renders and
 * the arithmetic here builds literally, so `0099-01-01` is kept and only year
 * zero — earlier than any date that input accepts — is refused. The `<select>`
 * the other two resolutions render lists its years unpadded, so anything below
 * year 1000 names an option nobody can pick.
 */
function requireCalendarBound(
  entry: VariableEntry,
  parameter: string,
  value: string,
  resolution: DateResolution,
): DateResolution {
  const written = pickerBoundResolution(value);

  // The DatePicker schema requires exact-resolution bounds; hand-built codebooks may bypass it.
  if (
    written === undefined ||
    boundResolution(truncateToResolution(value, resolution)) === undefined
  ) {
    throw new Error(
      `Date variable "${entry.name}" (${entry.id}) declares ${parameter} "${value}", which is not a calendar date. ` +
        'Synthetic data generation needs a date written as YYYY, YYYY-MM or YYYY-MM-DD.',
    );
  }

  const earliest = earliestOfferedYear(resolution);
  if (Number(value.slice(0, 4)) < earliest) {
    throw new Error(
      `Date variable "${entry.name}" (${entry.id}) declares ${parameter} "${value}", whose year is earlier than its picker can offer. ` +
        `Synthetic data generation needs a year of ${String(earliest).padStart(4, '0')} or later.`,
    );
  }

  return written;
}

/** The last day the calendar gives a month, with the year read literally. */
function lastDayOfMonth(year: number, month: number): number {
  return utcDate(year, month + 1, 0).getUTCDate();
}

/**
 * A bound written coarser than the date its picker collects — `min: "2020"` on
 * a full-date picker — completed to that picker's resolution.
 *
 * Nothing here is invented: both the control and the validator already read a
 * coarse bound, and this is what they read it as.
 *
 * A full-resolution field is a native `<input type="date">` handed the bound
 * verbatim, which ignores a `min`/`max` attribute it cannot parse as a date, so
 * the gate on such a field is the interview's own validator. That validator
 * compares at the coarser of the two resolutions — fresco-ui's
 * `compareDateStrings` truncates both sides to `Math.min(a.length, b.length)`
 * before comparing, "so that a year value overlapping a YYYY-MM-DD bound is
 * considered in-range". Under it `min: "2020"` admits every date from
 * 2020-01-01 and `max: "2020"` every date up to 2020-12-31. The two ends do
 * complete in opposite directions, but truncation is what makes them do so; the
 * window here only has to say the same thing.
 *
 * The month and year resolutions render a `<select>` instead, whose options
 * `DatePickerField` builds by running each bound through `ymdPattern` and
 * defaulting every missing component to 1 — at both ends, so a coarse ceiling
 * caps that year's month list at January. A value past it would validate and
 * still be one the control never offered, so those resolutions take the
 * control's reading rather than the validator's. (Only a month picker can reach
 * this: nothing is written coarser than a year.)
 */
function completeToResolution(
  value: string,
  resolution: DateResolution,
  end: BoundEnd,
): string {
  if (resolution === 'month') return `${value}-01`;

  if (end === 'floor') {
    return value.length === 4 ? `${value}-01-01` : `${value}-01`;
  }

  const year = value.slice(0, 4);
  const month = value.length === 4 ? 12 : Number(value.slice(5, 7));
  const day = lastDayOfMonth(Number(year), month);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * One end of a DatePicker's declared window, at the picker's own resolution.
 *
 * A bound written finer than the picker is sliced back to it, which is again
 * what the runtime validator's truncating comparison does with one. A bound
 * written at the picker's own resolution is kept verbatim: `DatePickerField`
 * parses `YYYY`, `YYYY-MM` and `YYYY-MM-DD` alike, and its `<select>`
 * stringifies each year and month from the parsed parts, so `min: "2030"` on a
 * year picker really does offer 2030 and `min: "2030-05"` on a month picker
 * really does offer May (fresco-ui's DatePicker tests, "year mode — partial
 * YYYY bounds" and "month mode — partial YYYY-MM bounds"). Protocols in the
 * wild carry these: `transnational-networks` declares `min: "1940"` on a year
 * picker.
 */
function resolveDeclaredBound(
  entry: VariableEntry,
  parameter: string,
  value: string,
  resolution: DateResolution,
  end: BoundEnd,
): string {
  const written = requireCalendarBound(entry, parameter, value, resolution);

  return RESOLUTION_SHAPE[written].length < RESOLUTION_SHAPE[resolution].length
    ? completeToResolution(value, resolution, end)
    : truncateToResolution(value, resolution);
}

function coarseBound(
  year: number,
  resolution: Exclude<DateResolution, 'full'>,
  month: 'first' | 'last',
): string {
  return resolution === 'year'
    ? String(year).padStart(4, '0')
    : `${String(year).padStart(4, '0')}-${month === 'first' ? '01' : '12'}`;
}

/**
 * A RelativeDatePicker's anchor, which is the one date parameter that has to be
 * a full one.
 *
 * Its window is counted in days either side of the anchor, so a coarser anchor
 * leaves `addDays` nothing to advance and collapses the window onto itself.
 * Unlike a DatePicker bound this is refused rather than completed, because the
 * schema refuses it too: `dateTimeRelativeDatePickerSchema` carries a
 * `superRefine` that rejects any anchor failing `isIsoDate`, whose regex is
 * `/^(\d{4})-(\d{2})-(\d{2})$/` — "RelativeDatePicker anchor must be a valid
 * ISO date (YYYY-MM-DD)". A coarse anchor arriving here is one no validated
 * protocol carries, so there is no reading of it to match.
 */
function requireAnchorDate(entry: VariableEntry, value: string): string {
  if (requireCalendarBound(entry, 'anchor', value, 'full') !== 'full') {
    throw new Error(
      `Date variable "${entry.name}" (${entry.id}) declares anchor "${value}", which is coarser than the date its picker collects. ` +
        `Synthetic data generation needs a bound written as ${RESOLUTION_SHAPE.full}.`,
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
    // though the protocol declares no explicit bound.
    const declaredAnchor = readString(parameters, 'anchor');
    const anchor =
      declaredAnchor !== undefined
        ? requireAnchorDate(entry, declaredAnchor)
        : today;
    const before =
      readNumber(parameters, 'before') ?? RELATIVE_DATE_PICKER_DEFAULT_BEFORE;
    const after =
      readNumber(parameters, 'after') ?? RELATIVE_DATE_PICKER_DEFAULT_AFTER;

    // Both ends of this window are derived, so both are held to the dates the
    // control can represent rather than refused. `anchor` is the declared half
    // and `requireCalendarBound` has already held it to a year the picker
    // offers; the offsets around it are what leave the calendar, in either
    // direction and from schema-valid parameters. `anchor: "9999-12-31"` with
    // `after: 1` derived `10000-01-01`, and a `before` reaching past an early
    // anchor derived `0000-07-05` — or `00-1-11-28`, which is not a date at all
    // and which `stepsBetween` reparses as year zero.
    //
    // The interview derives this same window twice more, in
    // `buildDatePickerBoundProps` and in `RelativeDatePickerField`, and a
    // generated value has to satisfy what those two validate. All three read the
    // clamp from shared-consts so the three windows cannot disagree; the parity
    // is held in @codaco/interview, the one package that can see all of them
    // (src/forms/__tests__/relativeDateWindowParity.test.ts).
    return {
      resolution: 'full',
      min: dateWithinPickerRange(anchor, -before),
      max: dateWithinPickerRange(anchor, after),
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
  const declaredMin =
    declared.min !== undefined
      ? resolveDeclaredBound(entry, 'min', declared.min, resolution, 'floor')
      : undefined;
  const declaredMax =
    declared.max !== undefined
      ? resolveDeclaredBound(entry, 'max', declared.max, resolution, 'ceiling')
      : undefined;
  const latestOffered = truncateToResolution(today, resolution);
  const defaultWindowSpanYears =
    Number(today.slice(0, 4)) - DATE_PICKER_DEFAULT_MIN_YEAR;
  // Coarse pickers are closed dropdowns. Their missing floor is the stable
  // 1920 default, except below that default where the runtime extends back by
  // its today-dependent default span and clamps at the year-1000 control floor.
  const min =
    declaredMin ??
    (resolution === 'full'
      ? undefined
      : coarseBound(
          declaredMax !== undefined &&
            Number(declaredMax.slice(0, 4)) < DATE_PICKER_DEFAULT_MIN_YEAR
            ? Math.max(
                COARSE_DATE_PICKER_MIN_YEAR,
                Number(declaredMax.slice(0, 4)) - defaultWindowSpanYears,
              )
            : DATE_PICKER_DEFAULT_MIN_YEAR,
          resolution,
          'first',
        ));
  // A missing coarse ceiling normally lands on today. If the authored floor is
  // later, the runtime extends the dropdown forward by the same default span
  // and clamps it at year 9999. Full resolution has no submission validator on
  // the missing side; generation deliberately samples the floor alone when it
  // lies in the future, which stays inside that wider submission domain.
  const openCeiling =
    min !== undefined && min > latestOffered
      ? resolution === 'full'
        ? min
        : coarseBound(
            Math.min(
              COARSE_DATE_PICKER_MAX_YEAR,
              Number(min.slice(0, 4)) + defaultWindowSpanYears,
            ),
            resolution,
            'last',
          )
      : latestOffered;

  const max = declaredMax ?? openCeiling;

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
