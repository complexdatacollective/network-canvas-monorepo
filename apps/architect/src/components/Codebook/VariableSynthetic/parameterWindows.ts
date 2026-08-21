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

/** The window one parameter is actually held to on one variable. */
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
