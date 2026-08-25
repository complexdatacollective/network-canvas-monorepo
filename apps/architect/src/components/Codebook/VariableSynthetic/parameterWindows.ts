import type { SyntheticParameter } from '~/components/Synthetic/schemaIntrospection';
import type { SyntheticWindow } from '~/components/Synthetic/summaries';
import {
  narrowedWindow,
  type NumericWindow,
  numericWindowOf,
} from '~/components/Synthetic/useNumericDraft';

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

/**
 * Where a parameter STARTS, and which carried values survive a change of
 * family: inside the variable's own range, so a family a researcher selects
 * arrives somewhere every value it can draw is a value the variable accepts.
 */
export const parameterWindow = (
  parameter: SyntheticParameter,
  valueWindow: SyntheticWindow,
): NumericWindow => {
  if (SPREAD_PARAMETERS.has(parameter.key)) return parameter.window;
  // Whether the parameter is a whole number is the SCHEMA's claim about the
  // parameter, so it survives from the parameter's own window; the variable's
  // validation range only ever narrows the endpoints.
  return narrowedWindow(parameter.window, numericWindowOf(valueWindow));
};

/**
 * Whether the schema would accept this parameter at this value, with
 * everything else the block currently states left as it stands.
 */
export type ParameterProbe = (key: string, candidate: number) => boolean;

/** The parameter's own bound on one side, as a window fragment. */
const ownMin = (window: NumericWindow) =>
  window.min === undefined
    ? { exclusiveMin: false }
    : { min: window.min, exclusiveMin: window.exclusiveMin };

const ownMax = (window: NumericWindow) =>
  window.max === undefined
    ? { exclusiveMax: false }
    : { max: window.max, exclusiveMax: window.exclusiveMax };

/**
 * A value just outside a narrowed bound and still inside the parameter's own
 * window, or `undefined` where the parameter's own window leaves no room —
 * in which case there is nothing the variable's range could have narrowed.
 */
const justOutside = (
  narrowedBound: number,
  own: { bound: number | undefined; exclusive: boolean },
  direction: -1 | 1,
): number | undefined => {
  const candidate = narrowedBound + direction;
  if (own.bound === undefined) return candidate;
  const beyond =
    direction === -1 ? candidate < own.bound : candidate > own.bound;
  if (!beyond) return candidate;
  if (own.exclusive) return undefined;
  return own.bound === narrowedBound ? undefined : own.bound;
};

/**
 * The window a parameter's CONTROL is held to: its own, narrowed to the
 * variable's value window only on the sides the schema actually binds.
 *
 * The variable's range bounds a VALUE of it, and only some parameters name a
 * value the schema then holds to that range. A constant does — the schema
 * refuses one outside the validation bounds outright — but a normal's mean
 * does not: generation clamps its draws into the window, so `normal(mean 10,
 * sd 5)` on an age validated 18–80 is a declaration the schema accepts, and a
 * uniform may legally reach below the floor as long as it still overlaps it.
 * Narrowing every parameter alike made those unrepresentable, which is the
 * opposite of the rule it was serving (spec rule 2 is about values the schema
 * would REFUSE).
 *
 * Which is which is asked rather than listed: each narrowed side is probed one
 * step outside, and the side is relaxed to the parameter's own bound where the
 * schema accepts a value there. So the answer follows the block as it stands —
 * a normal's mean is open while its spread can reach the window, and closes
 * onto the window when the spread is zero, which is exactly when the schema
 * starts refusing it. A block that is already refused for some other reason
 * answers "no" everywhere and leaves the narrow window in place, with the
 * schema's own sentence on screen beside it.
 */
export const parameterEntryWindow = (
  parameter: SyntheticParameter,
  valueWindow: SyntheticWindow,
  admits: ParameterProbe,
): NumericWindow => {
  if (SPREAD_PARAMETERS.has(parameter.key)) return parameter.window;
  const own = parameter.window;
  const narrowed = narrowedWindow(own, numericWindowOf(valueWindow));

  let window = narrowed;

  if (narrowed.min !== undefined && narrowed.min !== own.min) {
    const probe = justOutside(
      narrowed.min,
      { bound: own.min, exclusive: own.exclusiveMin },
      -1,
    );
    if (probe !== undefined && admits(parameter.key, probe)) {
      const { min: _dropped, ...rest } = window;
      window = { ...rest, ...ownMin(own) };
    }
  }

  if (narrowed.max !== undefined && narrowed.max !== own.max) {
    const probe = justOutside(
      narrowed.max,
      { bound: own.max, exclusive: own.exclusiveMax },
      1,
    );
    if (probe !== undefined && admits(parameter.key, probe)) {
      const { max: _dropped, ...rest } = window;
      window = { ...rest, ...ownMax(own) };
    }
  }

  return window;
};
