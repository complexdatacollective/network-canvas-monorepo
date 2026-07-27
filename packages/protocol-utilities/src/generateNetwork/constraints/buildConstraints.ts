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
  truncateToResolution,
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
    const anchor = readString(parameters, 'anchor') ?? today;
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
      ? truncateToResolution(declared.min, resolution)
      : undefined;
  const latestOffered = truncateToResolution(today, resolution);

  // DatePicker offers no date after today when the protocol declares no maximum
  // (its own `maxYmd` fallback), and the draw already ceilings an open window
  // there. Closing the window here rather than at the draw is what lets
  // `valueSpaceSize` count it: the count has to stay a pure function of the
  // descriptor, or a seeded run would stop reproducing across midnight. A floor
  // the protocol declares later than today is kept as the ceiling too — the
  // draw reaches exactly that one date, and an empty range fabricated from a
  // bound the protocol never wrote would refuse a date it generates perfectly
  // well.
  const max =
    declared.max !== undefined
      ? truncateToResolution(declared.max, resolution)
      : min !== undefined && min > latestOffered
        ? min
        : latestOffered;

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
