import { map, pickBy } from 'es-toolkit/compat';

import type { NodeShape } from '@codaco/fresco-ui/Node';
import type { VariableOptions } from '@codaco/protocol-validation';

const extraProperties = new Set(['type', 'color']);
const typesWithOptions = new Set(['categorical', 'ordinal']);

type Item = {
  name: string;
  type?: string;
  color?: string;
  shape?: { default: NodeShape };
  // Any codebook variable's options: categorical/ordinal (string/number) or
  // boolean variables (boolean value). Only categorical/ordinal options are
  // surfaced as Option.options (see asOption), so the boolean case is filtered.
  options?: { label: string; value: string | number | boolean }[];
  [key: string]: unknown;
};

type Option = {
  label: string;
  value: string;
  type?: string;
  color?: string;
  shape?: NodeShape;
  options?: VariableOptions;
};

const asOption = (item: Item, id: string): Option => {
  const required = {
    label: item.name,
    value: id,
  };
  const extra = pickBy(
    item,
    (value, key) => value && extraProperties.has(key),
  ) as Pick<Option, 'type' | 'color'>;

  // Node type definitions carry a shape; surface the default for previews
  const shapeField = item.shape ? { shape: item.shape.default } : {};

  // Include options for categorical/ordinal variables (string/number-valued;
  // filter out any boolean option so the result matches VariableOptions)
  const optionsField =
    item.type && typesWithOptions.has(item.type) && item.options
      ? {
          options: item.options.filter(
            (option): option is VariableOptions[number] =>
              typeof option.value !== 'boolean',
          ),
        }
      : {};

  return {
    ...extra,
    ...shapeField,
    ...optionsField,
    ...required,
  };
};

export const asOptions = (items: Record<string, Item>): Option[] =>
  map(items, asOption);
