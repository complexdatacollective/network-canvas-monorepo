import { isRecord } from '../../utils/isRecord';
import { type Option } from '../types';

type RangePreset = {
  label: string;
  min: number;
  max: number;
};

export type RangeFilterConfig = {
  type: 'range';
  min: number;
  max: number;
  step?: number;
  presets?: RangePreset[];
  formatLabel?: (value: number) => string;
};

export type DateFilterConfig = {
  type: 'date';
};

export type TextFilterConfig = {
  type: 'text';
  placeholder?: string;
};

export type BooleanFilterConfig = {
  type: 'boolean';
  trueLabel: string;
  falseLabel: string;
};

export type FacetedFilterConfig = {
  type: 'faceted';
  options: Option[] | ((data: unknown[]) => Option[]);
};

export type OperatorFilterConfig = {
  type: 'operator';
  operators: ('eq' | 'gt' | 'lt' | 'gte' | 'lte')[];
  entitySelector?: {
    label: string;
    getOptions: (data: unknown[]) => Option[];
  };
};

export type FilterConfig =
  | RangeFilterConfig
  | DateFilterConfig
  | TextFilterConfig
  | BooleanFilterConfig
  | FacetedFilterConfig
  | OperatorFilterConfig;

export type RangeFilterValue = {
  min: number;
  max: number;
};

export type DateFilterValue = {
  from: string;
  to: string;
};

type BooleanFilterValue = boolean;

type FacetedFilterValue = string[];

type TextFilterValue = string;

export type OperatorCondition = {
  entityType: string;
  entityLabel: string;
  entityKind: 'nodes' | 'edges';
  operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte';
  value: number;
};

export type OperatorFilterValue = {
  conditions: OperatorCondition[];
};

export type FilterValue =
  | RangeFilterValue
  | DateFilterValue
  | TextFilterValue
  | BooleanFilterValue
  | FacetedFilterValue
  | OperatorFilterValue;

// TanStack stores column filter values as `unknown`; these guards recover the
// shape each filter component writes. A value of another shape is treated as
// "no filter" rather than being handed to a component that cannot read it.
export const isRangeFilterValue = (value: unknown): value is RangeFilterValue =>
  isRecord(value) &&
  typeof value.min === 'number' &&
  typeof value.max === 'number';

export const isDateFilterValue = (value: unknown): value is DateFilterValue =>
  isRecord(value) &&
  typeof value.from === 'string' &&
  typeof value.to === 'string';

export const isFacetedFilterValue = (
  value: unknown,
): value is FacetedFilterValue =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const CONDITION_OPERATORS: readonly OperatorCondition['operator'][] = [
  'eq',
  'gt',
  'lt',
  'gte',
  'lte',
];

const isOperatorCondition = (value: unknown): value is OperatorCondition =>
  isRecord(value) &&
  typeof value.entityType === 'string' &&
  typeof value.entityLabel === 'string' &&
  (value.entityKind === 'nodes' || value.entityKind === 'edges') &&
  CONDITION_OPERATORS.some((operator) => operator === value.operator) &&
  typeof value.value === 'number';

export const isOperatorFilterValue = (
  value: unknown,
): value is OperatorFilterValue =>
  isRecord(value) &&
  Array.isArray(value.conditions) &&
  value.conditions.every(isOperatorCondition);

export const isFilterValue = (value: unknown): value is FilterValue =>
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  isRangeFilterValue(value) ||
  isDateFilterValue(value) ||
  isFacetedFilterValue(value) ||
  isOperatorFilterValue(value);
