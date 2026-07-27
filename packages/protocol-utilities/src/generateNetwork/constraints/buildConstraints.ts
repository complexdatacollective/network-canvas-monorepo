import type { Variables } from '@codaco/protocol-validation';

import type { VariableEntry } from '../../types';
import { toVariableEntry } from '../attributes';
import {
  addDays,
  type DateResolution,
  type DateWindow,
  truncateToResolution,
} from './dateWindow';
import type { EntityConstraints, VariableConstraints } from './types';

// Mirrors RelativeDatePicker's own defaults, which useProtocolForm turns into
// hard min/max validators; a generated value outside this window fails
// validation even though the protocol declares no explicit bound.
const RELATIVE_DEFAULT_BEFORE = 180;
const RELATIVE_DEFAULT_AFTER = 0;

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
    const anchor = readString(parameters, 'anchor') ?? today;
    const before = readNumber(parameters, 'before') ?? RELATIVE_DEFAULT_BEFORE;
    const after = readNumber(parameters, 'after') ?? RELATIVE_DEFAULT_AFTER;
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

  const min = readString(parameters, 'min');
  const max = readString(parameters, 'max');

  return {
    resolution,
    ...(min !== undefined
      ? { min: truncateToResolution(min, resolution) }
      : {}),
    ...(max !== undefined
      ? { max: truncateToResolution(max, resolution) }
      : {}),
  };
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
    minValue: readNumber(validation, 'minValue'),
    maxValue: readNumber(validation, 'maxValue'),
    minSelected: readNumber(validation, 'minSelected'),
    maxSelected: readNumber(validation, 'maxSelected'),
    sameAs: readString(validation, 'sameAs'),
    differentFrom: readString(validation, 'differentFrom'),
    greaterThanVariable: readString(validation, 'greaterThanVariable'),
    lessThanVariable: readString(validation, 'lessThanVariable'),
    greaterThanOrEqualToVariable: readString(
      validation,
      'greaterThanOrEqualToVariable',
    ),
    lessThanOrEqualToVariable: readString(
      validation,
      'lessThanOrEqualToVariable',
    ),
    dateWindow: resolveDateWindow(entry, today),
  };
}

export function buildEntityConstraints(
  variables: Variables | undefined,
  today: string,
): EntityConstraints {
  const result: EntityConstraints = new Map();
  if (!variables) return result;

  for (const [varId, variable] of Object.entries(variables)) {
    const entry = toVariableEntry(varId, variable);
    result.set(varId, {
      entry,
      constraints: buildVariableConstraints(entry, today),
    });
  }

  return result;
}
