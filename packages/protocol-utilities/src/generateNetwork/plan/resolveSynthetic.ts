import {
  DEFAULT_OPTION_WEIGHT,
  type EdgeDefinition,
  type EdgeTopology,
  type NodeDefinition,
  optionValueKey,
  type SyntheticCount,
  type SyntheticTextGenerator,
  type Variable,
} from '@codaco/protocol-validation';

import type { ContinuousDescriptor, ValueBounds } from './distributions';

/**
 * Resolution of `synthetic` metadata to the concrete parameters generation
 * draws from. Declared metadata wins; everything absent falls back to the
 * documented defaults below — never to stage-specific tuning. Architect's
 * "initialize from resolved default" flow reads the same resolution, so what
 * the UI offers as a starting point is exactly what an undeclared protocol
 * generates with.
 */

export const DEFAULT_NODE_COUNT: SyntheticCount = {
  distribution: 'uniform',
  min: 1,
  max: 8,
};

/** A node type no reachable stage can create defaults to a population of 0. */
export const UNREACHABLE_NODE_COUNT: SyntheticCount = {
  distribution: 'constant',
  value: 0,
};

export const DEFAULT_EDGE_TOPOLOGY: EdgeTopology = {
  metric: 'density',
  distribution: { distribution: 'uniform', min: 0.3, max: 0.5 },
};

/** Window a number variable draws over when validation gives no usable one. */
export const DEFAULT_NUMBER_WINDOW = { min: 18, max: 80 } as const;

export const DEFAULT_PROBABILITY_TRUE = 0.5;

export type ResolvedDatetimeDescriptor =
  | { distribution: 'uniform'; min?: string; max?: string }
  | {
      distribution: 'normal';
      mean: string;
      sdDays: number;
      min?: string;
      max?: string;
    };

export type ResolvedVariableSynthetic =
  | {
      kind: 'number';
      descriptor: ContinuousDescriptor;
      bounds: ValueBounds;
      missingProbability: number;
    }
  | {
      kind: 'scalar';
      descriptor: ContinuousDescriptor;
      bounds: ValueBounds;
      missingProbability: number;
    }
  | { kind: 'boolean'; probabilityTrue: number; missingProbability: number }
  | {
      kind: 'ordinal';
      values: (string | number)[];
      weights: number[];
      missingProbability: number;
    }
  | {
      kind: 'categorical';
      values: (string | number)[];
      weights: number[];
      selectionCounts: { count: number; probability: number }[];
      missingProbability: number;
    }
  | {
      kind: 'datetime';
      descriptor: ResolvedDatetimeDescriptor;
      missingProbability: number;
    }
  | {
      kind: 'text';
      generator: SyntheticTextGenerator | 'neutralWords';
      missingProbability: number;
    }
  // Layout and location values are owned by the stages that place them.
  | { kind: 'stageOwned' };

export function resolveNodeCount(
  definition: Pick<NodeDefinition, 'synthetic'> | undefined,
  options: { creatable: boolean },
): SyntheticCount {
  const declared = definition?.synthetic?.count;
  if (declared) return declared;
  return options.creatable ? DEFAULT_NODE_COUNT : UNREACHABLE_NODE_COUNT;
}

export function resolveEdgeTopology(
  definition: Pick<EdgeDefinition, 'synthetic'> | undefined,
): EdgeTopology {
  return definition?.synthetic?.topology ?? DEFAULT_EDGE_TOPOLOGY;
}

// 'name', 'nickname', 'firstName', 'first_name', … — endings are the signal;
// anything else gets neutral words rather than today's incongruous
// first-names-for-everything.
const NAME_LIKE = /name$/;

export function inferTextGenerator(
  variableName: string,
): SyntheticTextGenerator | 'neutralWords' {
  return NAME_LIKE.test(variableName.trim().toLowerCase())
    ? 'personName'
    : 'neutralWords';
}

/**
 * The window an undeclared number variable draws uniformly over. Validation
 * bounds are used whenever they form a finite window; a one-sided bound
 * anchors the default-width window at itself; no bounds at all falls back to
 * {@link DEFAULT_NUMBER_WINDOW}.
 */
export function defaultNumberWindow(
  minValue: number | undefined,
  maxValue: number | undefined,
): { min: number; max: number } {
  const span = DEFAULT_NUMBER_WINDOW.max - DEFAULT_NUMBER_WINDOW.min;
  if (minValue !== undefined && maxValue !== undefined) {
    return { min: minValue, max: maxValue };
  }
  if (minValue !== undefined) {
    // Keep the default ceiling while it lies above the floor; otherwise slide
    // a default-width window up to the floor.
    return {
      min: minValue,
      max:
        minValue < DEFAULT_NUMBER_WINDOW.max
          ? DEFAULT_NUMBER_WINDOW.max
          : minValue + span,
    };
  }
  if (maxValue !== undefined) {
    return {
      min:
        maxValue > DEFAULT_NUMBER_WINDOW.min
          ? DEFAULT_NUMBER_WINDOW.min
          : maxValue - span,
      max: maxValue,
    };
  }
  return { ...DEFAULT_NUMBER_WINDOW };
}

/** Distinct typed option values in first-occurrence order. */
function distinctValues(
  options: readonly { value: string | number }[],
): (string | number)[] {
  const seen = new Set<string>();
  const values: (string | number)[] = [];
  for (const option of options) {
    const key = optionValueKey(option.value);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(option.value);
  }
  return values;
}

function resolveWeights(
  values: readonly (string | number)[],
  declared: readonly { value: string | number; weight: number }[] | undefined,
): number[] {
  if (!declared) return values.map(() => DEFAULT_OPTION_WEIGHT);
  const byKey = new Map(
    declared.map((entry) => [optionValueKey(entry.value), entry.weight]),
  );
  return values.map(
    (value) => byKey.get(optionValueKey(value)) ?? DEFAULT_OPTION_WEIGHT,
  );
}

function resolveMissingProbability(variable: {
  validation?: { required?: boolean };
  synthetic?: { missingProbability?: number };
}): number {
  // Schema validation already rejects the declared combination; the belt here
  // keeps a required variable answered even for unvalidated input.
  if (variable.validation?.required === true) return 0;
  return variable.synthetic?.missingProbability ?? 0;
}

function legalSelectionCounts(
  positiveWeightCount: number,
  validation:
    | { required?: boolean; minSelected?: number; maxSelected?: number }
    | undefined,
): { count: number; probability: number }[] {
  const highest = Math.min(
    validation?.maxSelected ?? positiveWeightCount,
    positiveWeightCount,
  );
  const lowest = Math.max(1, validation?.minSelected ?? 1);
  const counts: number[] = [];
  if (validation?.required !== true) counts.push(0);
  for (let count = lowest; count <= highest; count++) counts.push(count);
  if (counts.length === 0) {
    // Contradictory validation (e.g. required with minSelected above the
    // option count) is rejected elsewhere; degrade to the nearest reachable
    // count so resolution itself never fails.
    counts.push(Math.max(0, Math.min(lowest, positiveWeightCount)));
  }
  const probability = 1 / counts.length;
  return counts.map((count) => ({ count, probability }));
}

export function resolveVariableSynthetic(
  variable: Variable,
): ResolvedVariableSynthetic {
  switch (variable.type) {
    case 'layout':
    case 'location':
      return { kind: 'stageOwned' };

    case 'number': {
      const synthetic = variable.synthetic;
      const declared =
        synthetic && 'distribution' in synthetic ? synthetic : undefined;
      const bounds: ValueBounds = {};
      if (variable.validation?.minValue !== undefined) {
        bounds.min = variable.validation.minValue;
      }
      if (variable.validation?.maxValue !== undefined) {
        bounds.max = variable.validation.maxValue;
      }
      const descriptor: ContinuousDescriptor = declared ?? {
        distribution: 'uniform',
        ...defaultNumberWindow(bounds.min, bounds.max),
      };
      return {
        kind: 'number',
        descriptor,
        bounds,
        missingProbability: resolveMissingProbability(variable),
      };
    }

    case 'scalar': {
      const synthetic = variable.synthetic;
      const declared =
        synthetic && 'distribution' in synthetic ? synthetic : undefined;
      return {
        kind: 'scalar',
        descriptor: declared ?? { distribution: 'uniform' },
        bounds: { min: 0, max: 1 },
        missingProbability: resolveMissingProbability(variable),
      };
    }

    case 'boolean':
      return {
        kind: 'boolean',
        probabilityTrue:
          variable.synthetic?.probabilityTrue ?? DEFAULT_PROBABILITY_TRUE,
        missingProbability: resolveMissingProbability(variable),
      };

    case 'ordinal': {
      const values = distinctValues(variable.options);
      return {
        kind: 'ordinal',
        values,
        weights: resolveWeights(values, variable.synthetic?.optionWeights),
        missingProbability: resolveMissingProbability(variable),
      };
    }

    case 'categorical': {
      const values = distinctValues(variable.options);
      const weights = resolveWeights(values, variable.synthetic?.optionWeights);
      const declaredCounts = variable.synthetic?.selectionCount?.probabilities;
      const positiveWeightCount = weights.filter((weight) => weight > 0).length;
      return {
        kind: 'categorical',
        values,
        weights,
        selectionCounts:
          declaredCounts ??
          legalSelectionCounts(positiveWeightCount, variable.validation),
        missingProbability: resolveMissingProbability(variable),
      };
    }

    case 'datetime': {
      const synthetic = variable.synthetic;
      const declared =
        synthetic && 'distribution' in synthetic ? synthetic : undefined;
      return {
        kind: 'datetime',
        descriptor: declared ?? { distribution: 'uniform' },
        missingProbability: resolveMissingProbability(variable),
      };
    }

    case 'text':
      return {
        kind: 'text',
        generator:
          variable.synthetic?.generator ?? inferTextGenerator(variable.name),
        missingProbability: resolveMissingProbability(variable),
      };
  }
}
