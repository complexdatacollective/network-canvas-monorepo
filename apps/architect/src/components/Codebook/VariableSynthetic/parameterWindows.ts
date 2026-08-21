import type { SyntheticWindow } from '~/components/Synthetic/summaries';

import type { NumericWindow, SyntheticParameter } from './schemaIntrospection';

/**
 * Where a distribution parameter's own window meets the window the VARIABLE
 * is held to, and what to put in a parameter that has just come into being.
 *
 * The schema states what a parameter may be in the abstract — a scalar's mean
 * lives on the unit interval, a lognormal's mean is positive. The variable
 * states what a VALUE of it may be — an age validated between 18 and 80. A
 * parameter that names a value has to satisfy both, which is what "window
 * clamped to the variable's own validation range where one exists" means; a
 * parameter that names a SPREAD satisfies only its own.
 */

/**
 * The parameters that describe how far values spread rather than where they
 * sit. A standard deviation of 3 is not a value of the variable, so a variable
 * validated between 18 and 80 does not bound it.
 *
 * The one piece of parameter semantics this editor holds: the schema types
 * every parameter as a number and cannot say which of them the variable's own
 * range applies to.
 */
const SPREAD_PARAMETERS: ReadonlySet<string> = new Set(['sd', 'sdDays']);

type MinPart = Pick<NumericWindow, 'min' | 'exclusiveMin'>;
type MaxPart = Pick<NumericWindow, 'max' | 'exclusiveMax'>;

// Only the half each helper is about. Returning a whole window from either
// would let the second spread overwrite what the first decided — which is how
// a strict lower bound once came back inclusive, and a lognormal mean started
// at the zero its schema excludes.
const minPart = (window: MinPart): MinPart =>
  window.min === undefined
    ? { exclusiveMin: false }
    : { min: window.min, exclusiveMin: window.exclusiveMin };

const maxPart = (window: MaxPart): MaxPart =>
  window.max === undefined
    ? { exclusiveMax: false }
    : { max: window.max, exclusiveMax: window.exclusiveMax };

const tighterMin = (a: MinPart, b: MinPart): MinPart => {
  if (a.min === undefined) return minPart(b);
  if (b.min === undefined) return minPart(a);
  if (a.min > b.min) return minPart(a);
  if (b.min > a.min) return minPart(b);
  // Equal bounds: the exclusive reading is the tighter one.
  return { min: a.min, exclusiveMin: a.exclusiveMin || b.exclusiveMin };
};

const tighterMax = (a: MaxPart, b: MaxPart): MaxPart => {
  if (a.max === undefined) return maxPart(b);
  if (b.max === undefined) return maxPart(a);
  if (a.max < b.max) return maxPart(a);
  if (b.max < a.max) return maxPart(b);
  return { max: a.max, exclusiveMax: a.exclusiveMax || b.exclusiveMax };
};

/** A value window read as a numeric one; an infinite side is an open side. */
const asNumericWindow = (bounds: SyntheticWindow): NumericWindow => ({
  ...(Number.isFinite(bounds.min) ? { min: bounds.min } : {}),
  ...(Number.isFinite(bounds.max) ? { max: bounds.max } : {}),
  exclusiveMin: false,
  exclusiveMax: false,
  integer: false,
});

/** The window one parameter is actually held to on one variable. */
export const parameterWindow = (
  parameter: SyntheticParameter,
  valueWindow: SyntheticWindow,
): NumericWindow => {
  if (SPREAD_PARAMETERS.has(parameter.key)) return parameter.window;
  const variable = asNumericWindow(valueWindow);
  return {
    ...tighterMin(parameter.window, variable),
    ...tighterMax(parameter.window, variable),
    integer: parameter.window.integer,
  };
};

/**
 * A value to put in a parameter that has just appeared, because the researcher
 * chose a distribution family that carries it.
 *
 * The middle of the window where it has one, so a bounded parameter starts
 * somewhere the whole range is reachable from; the open side's own bound
 * otherwise, stepped inside where the bound is exclusive. A parameter with no
 * window at all starts at zero, which every unbounded family accepts.
 */
export const seedParameterValue = (window: NumericWindow): number => {
  const { min, max, exclusiveMin, exclusiveMax, integer } = window;
  const round = (value: number) => (integer ? Math.round(value) : value);

  if (min !== undefined && max !== undefined) {
    const middle = round((min + max) / 2);
    if (middle > min && middle < max) return middle;
    if (!exclusiveMin && middle <= min) return min;
    if (!exclusiveMax && middle >= max) return max;
    return middle;
  }
  if (min !== undefined) return exclusiveMin ? round(min + 1) : min;
  if (max !== undefined) return exclusiveMax ? round(max - 1) : max;
  return 0;
};
