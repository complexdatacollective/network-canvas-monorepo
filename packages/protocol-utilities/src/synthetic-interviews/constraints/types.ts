import type {
  ResolvedVariableSynthetic,
  VARIABLE_REFERENCE_VALIDATIONS,
} from '@codaco/protocol-validation';

import type { DateWindow } from './dateWindow';
import type { VariableEntry } from './variableEntry';

export type VariableConstraints = {
  required: boolean;
  unique: boolean;
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  minSelected?: number;
  maxSelected?: number;
  sameAs?: string;
  differentFrom?: string;
  greaterThanVariable?: string;
  lessThanVariable?: string;
  greaterThanOrEqualToVariable?: string;
  lessThanOrEqualToVariable?: string;
  dateWindow?: DateWindow;
};

export type ConstrainedVariable = {
  entry: VariableEntry;
  constraints: VariableConstraints;
  /**
   * What this variable's values should LOOK like, as opposed to which of them
   * are legal — every field of it resolved, so nothing downstream has to decide
   * what an absent one means.
   *
   * Resolved by `@codaco/protocol-validation`'s `resolveVariableSynthetic`
   * against the same constraints beside it, so a variable that declared nothing
   * arrives carrying the schema's own defaults rather than meeting a fallback
   * further down. Generation holds no such number of its own.
   *
   * `undefined` only for `layout` and `location`, which have no descriptor: the
   * generator produces deterministic positions for both.
   */
  descriptor: ResolvedVariableSynthetic | undefined;
};

export type EntityConstraints = Map<string, ConstrainedVariable>;

/**
 * The comparison rules, in the order later code iterates them. Kept as a
 * literal tuple so a new comparator cannot be added to the descriptor without
 * a type error at every site that switches on the set, and held against the
 * schema's own list of rules whose value is another variable's id so a name
 * renamed there cannot survive here as a rule no protocol will ever carry.
 */
export const COMPARISON_RULES = [
  'greaterThanVariable',
  'lessThanVariable',
  'greaterThanOrEqualToVariable',
  'lessThanOrEqualToVariable',
] as const satisfies readonly (typeof VARIABLE_REFERENCE_VALIDATIONS)[number][];

type ComparisonRule = (typeof COMPARISON_RULES)[number];

/**
 * What each comparator means, as whether the declaring variable is the upper
 * end of the pair and whether the two values may be equal. Every consumer reads
 * strictness from here, so ordering and feasibility can never disagree about
 * whether touching bounds satisfy a comparator.
 */
export const COMPARATOR_DIRECTION: Record<
  ComparisonRule,
  { ownerIsUpper: boolean; strict: boolean }
> = {
  greaterThanVariable: { ownerIsUpper: true, strict: true },
  lessThanVariable: { ownerIsUpper: false, strict: true },
  greaterThanOrEqualToVariable: { ownerIsUpper: true, strict: false },
  lessThanOrEqualToVariable: { ownerIsUpper: false, strict: false },
};
