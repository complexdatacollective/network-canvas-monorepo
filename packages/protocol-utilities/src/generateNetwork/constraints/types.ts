import type { VariableEntry } from '../../types';
import type { DateWindow } from './dateWindow';

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
};

export type EntityConstraints = Map<string, ConstrainedVariable>;

/**
 * The comparison rules, in the order later code iterates them. Kept as a
 * literal tuple so a new comparator cannot be added to the descriptor without
 * a type error at every site that switches on the set.
 */
export const COMPARISON_RULES = [
  'greaterThanVariable',
  'lessThanVariable',
  'greaterThanOrEqualToVariable',
  'lessThanOrEqualToVariable',
] as const;

export type ComparisonRule = (typeof COMPARISON_RULES)[number];
