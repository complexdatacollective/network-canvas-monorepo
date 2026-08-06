import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import { resolveVariableSynthetic } from '@codaco/protocol-utilities';
import {
  DEFAULT_OPTION_WEIGHT,
  optionValueKey,
  type Variable,
  type VariableSynthetic,
} from '@codaco/protocol-validation';

/**
 * Pure draft model for the variable editor's "Synthetic data" section.
 *
 * The section is optional: when it is off nothing is stored and runtime
 * defaults apply. When it is enabled, the form is initialised from the SAME
 * resolution the generator draws with (`resolveVariableSynthetic`), so the
 * UI's starting point is exactly what an undeclared protocol produces.
 * Submission assembles a schema-valid `synthetic` object from the flat field
 * values, normalising selection-count probabilities to sum to 1.
 */

export type SyntheticDraftContext = {
  variable: Variable;
  /**
   * The DRAFT option list (categorical/ordinal): weight and selection-count
   * rows must reconcile immediately when the draft's options change, so rows
   * derive from these rather than from the saved variable.
   */
  options: readonly { label: string; value: string | number }[];
  /** The draft's required flag; missingness is unavailable when set. */
  required: boolean;
};

export type SyntheticFieldValues = Record<string, FieldValue>;

export const SYNTHETIC_ENABLED_FIELD = 'syntheticEnabled';

const PREFIX = 'synthetic';

// Underscore-joined FLAT names: the form store treats '.' in a field name as
// a nesting path, which would scatter these values across a nested object at
// submit time (and option values could themselves contain dots).
export const syntheticField = (...parts: (string | number)[]): string =>
  [PREFIX, ...parts].join('_');

const toNumber = (value: FieldValue | undefined): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toText = (value: FieldValue | undefined): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/** Distinct typed option values in first-occurrence order. */
export function distinctDraftValues(
  options: SyntheticDraftContext['options'],
): { value: string | number; label: string }[] {
  const seen = new Set<string>();
  const values: { value: string | number; label: string }[] = [];
  for (const option of options) {
    const key = optionValueKey(option.value);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push({ value: option.value, label: option.label });
  }
  return values;
}

export type WeightRow = {
  fieldName: string;
  value: string | number;
  label: string;
  initial: number;
};

/** One weight row per distinct draft option value. */
export function weightRows(ctx: SyntheticDraftContext): WeightRow[] {
  const synthetic =
    'synthetic' in ctx.variable ? ctx.variable.synthetic : undefined;
  const declaredWeights =
    synthetic && 'optionWeights' in synthetic
      ? synthetic.optionWeights
      : undefined;
  const declared = declaredWeights
    ? new Map(
        declaredWeights.map((entry) => [
          optionValueKey(entry.value),
          entry.weight,
        ]),
      )
    : undefined;
  return distinctDraftValues(ctx.options).map(({ value, label }, index) => ({
    fieldName: syntheticField('weight', index),
    value,
    label,
    initial: declared?.get(optionValueKey(value)) ?? DEFAULT_OPTION_WEIGHT,
  }));
}

/** The legal selection counts under the draft's options and validation. */
export function legalCounts(ctx: SyntheticDraftContext): number[] {
  const distinct = distinctDraftValues(ctx.options).length;
  const validation =
    'validation' in ctx.variable ? (ctx.variable.validation ?? {}) : {};
  const minSelected =
    'minSelected' in validation
      ? (validation.minSelected as number)
      : undefined;
  const maxSelected =
    'maxSelected' in validation
      ? (validation.maxSelected as number)
      : undefined;
  const lowest = Math.max(1, minSelected ?? 1);
  const highest = Math.min(maxSelected ?? distinct, distinct);
  const counts: number[] = [];
  if (!ctx.required) counts.push(0);
  for (let count = lowest; count <= highest; count++) counts.push(count);
  return counts;
}

export type SelectionCountRow = {
  fieldName: string;
  count: number;
  /** Distinguishes an answered-empty selection from a missing value. */
  label: string;
  initial: number;
};

export function selectionCountRows(
  ctx: SyntheticDraftContext,
): SelectionCountRow[] {
  const counts = legalCounts(ctx);
  const declaredTable =
    ctx.variable.type === 'categorical'
      ? ctx.variable.synthetic?.selectionCount
      : undefined;
  const declared = declaredTable
    ? new Map(
        declaredTable.probabilities.map((entry) => [
          entry.count,
          entry.probability,
        ]),
      )
    : undefined;
  const uniform = counts.length > 0 ? 1 / counts.length : 0;
  return counts.map((count) => ({
    fieldName: syntheticField('count', count),
    count,
    label:
      count === 0 ? 'No selection (answered, left empty)' : `${count} selected`,
    initial:
      declared?.get(count) ?? Number((declared ? 0 : uniform).toFixed(4)),
  }));
}

/**
 * Initial flat field values: the declared metadata where present, otherwise
 * the resolved runtime default for the variable's type.
 */
export function initialSyntheticValues(
  ctx: SyntheticDraftContext,
): SyntheticFieldValues {
  const resolved = resolveVariableSynthetic(ctx.variable);
  const declaredSynthetic =
    'synthetic' in ctx.variable ? ctx.variable.synthetic : undefined;
  const values: SyntheticFieldValues = {
    [SYNTHETIC_ENABLED_FIELD]: Boolean(declaredSynthetic),
  };
  const missing =
    declaredSynthetic && 'missingProbability' in declaredSynthetic
      ? declaredSynthetic.missingProbability
      : undefined;
  if (missing !== undefined) {
    values[syntheticField('missingProbability')] = missing;
  }

  switch (resolved.kind) {
    case 'number':
    case 'scalar': {
      const descriptor = resolved.descriptor;
      values[syntheticField('distribution')] = descriptor.distribution;
      if ('mean' in descriptor) {
        values[syntheticField('mean')] = descriptor.mean;
      }
      if ('sd' in descriptor) values[syntheticField('sd')] = descriptor.sd;
      if ('min' in descriptor && descriptor.min !== undefined) {
        values[syntheticField('min')] = descriptor.min;
      }
      if ('max' in descriptor && descriptor.max !== undefined) {
        values[syntheticField('max')] = descriptor.max;
      }
      if ('value' in descriptor) {
        values[syntheticField('value')] = descriptor.value;
      }
      break;
    }
    case 'boolean':
      values[syntheticField('probabilityTrue')] = resolved.probabilityTrue;
      break;
    case 'datetime': {
      const descriptor = resolved.descriptor;
      values[syntheticField('distribution')] = descriptor.distribution;
      if (descriptor.min !== undefined) {
        values[syntheticField('min')] = descriptor.min;
      }
      if (descriptor.max !== undefined) {
        values[syntheticField('max')] = descriptor.max;
      }
      if (descriptor.distribution === 'normal') {
        values[syntheticField('mean')] = descriptor.mean;
        values[syntheticField('sdDays')] = descriptor.sdDays;
      }
      break;
    }
    case 'text':
      values[syntheticField('generator')] =
        resolved.generator === 'neutralWords' ? '' : resolved.generator;
      break;
    case 'ordinal':
    case 'categorical': {
      for (const row of weightRows(ctx)) {
        values[row.fieldName] = row.initial;
      }
      if (resolved.kind === 'categorical') {
        for (const row of selectionCountRows(ctx)) {
          values[row.fieldName] = row.initial;
        }
      }
      break;
    }
    case 'stageOwned':
      break;
  }
  return values;
}

/**
 * Assembles the `synthetic` object the codebook stores from the flat draft
 * values. Returns undefined for stage-owned types (layout/location) or when
 * nothing meaningful was entered. Stale weight rows (values the draft's
 * options no longer offer) are never emitted: rows derive from the current
 * draft options by construction.
 */
export function assembleSynthetic(
  ctx: SyntheticDraftContext,
  values: SyntheticFieldValues,
): VariableSynthetic | undefined {
  const get = (name: string): FieldValue | undefined =>
    values[syntheticField(name)];
  const missingProbability = ctx.required
    ? undefined
    : toNumber(get('missingProbability'));
  const missing =
    missingProbability !== undefined && missingProbability > 0
      ? { missingProbability }
      : {};

  switch (ctx.variable.type) {
    case 'layout':
    case 'location':
      return undefined;

    case 'number':
    case 'scalar': {
      const distribution = toText(get('distribution'));
      if (!distribution) {
        return missingProbability !== undefined && missingProbability > 0
          ? { missingProbability }
          : undefined;
      }
      const mean = toNumber(get('mean'));
      const sd = toNumber(get('sd'));
      const min = toNumber(get('min'));
      const max = toNumber(get('max'));
      const value = toNumber(get('value'));
      if (distribution === 'constant') {
        return value === undefined
          ? undefined
          : ({ distribution, value, ...missing } as VariableSynthetic);
      }
      if (distribution === 'uniform') {
        return {
          distribution,
          ...(min !== undefined ? { min } : {}),
          ...(max !== undefined ? { max } : {}),
          ...missing,
        } as VariableSynthetic;
      }
      // normal / lognormal / beta share mean+sd with optional truncation.
      if (mean === undefined || sd === undefined) return undefined;
      return {
        distribution,
        mean,
        sd,
        ...(min !== undefined ? { min } : {}),
        ...(max !== undefined ? { max } : {}),
        ...missing,
      } as VariableSynthetic;
    }

    case 'boolean': {
      const probabilityTrue = toNumber(get('probabilityTrue'));
      if (probabilityTrue === undefined && missingProbability === undefined) {
        return undefined;
      }
      return {
        ...(probabilityTrue !== undefined ? { probabilityTrue } : {}),
        ...missing,
      } as VariableSynthetic;
    }

    case 'datetime': {
      const distribution = toText(get('distribution'));
      const min = toText(get('min'));
      const max = toText(get('max'));
      if (distribution === 'normal') {
        const mean = toText(get('mean'));
        const sdDays = toNumber(get('sdDays'));
        if (!mean || sdDays === undefined) return undefined;
        return {
          distribution: 'normal',
          mean,
          sdDays,
          ...(min ? { min } : {}),
          ...(max ? { max } : {}),
          ...missing,
        } as VariableSynthetic;
      }
      return {
        distribution: 'uniform',
        ...(min ? { min } : {}),
        ...(max ? { max } : {}),
        ...missing,
      } as VariableSynthetic;
    }

    case 'text': {
      const generator = toText(get('generator'));
      if (!generator && missingProbability === undefined) return undefined;
      return {
        ...(generator ? { generator } : {}),
        ...missing,
      } as VariableSynthetic;
    }

    case 'ordinal':
    case 'categorical': {
      const optionWeights = weightRows(ctx)
        .map((row) => ({
          value: row.value,
          weight: toNumber(values[row.fieldName]) ?? DEFAULT_OPTION_WEIGHT,
        }))
        .filter((entry) => entry.weight >= 0);
      const base: Record<string, unknown> = {};
      if (optionWeights.length > 0) base.optionWeights = optionWeights;

      if (ctx.variable.type === 'categorical') {
        const rows = selectionCountRows(ctx).map((row) => ({
          count: row.count,
          probability: Math.max(0, toNumber(values[row.fieldName]) ?? 0),
        }));
        const total = rows.reduce((sum, row) => sum + row.probability, 0);
        if (total > 0) {
          // Normalised so the stored table always satisfies the schema's
          // sum-to-one rule whatever mixture the researcher typed.
          base.selectionCount = {
            probabilities: rows.map((row) => ({
              count: row.count,
              probability: row.probability / total,
            })),
          };
        }
      }
      if (Object.keys(base).length === 0 && missingProbability === undefined) {
        return undefined;
      }
      return { ...base, ...missing } as VariableSynthetic;
    }
  }
}
