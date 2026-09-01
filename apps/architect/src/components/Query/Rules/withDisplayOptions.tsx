import type { NodeShape } from '@codaco/fresco-ui/Node';
import {
  type ColorReference,
  ColorReferenceSchema,
  type VariableType,
  VariableTypesKeys,
} from '@codaco/protocol-validation';

import type { PreviewTextOptions } from './PreviewText';

type OptionItem = {
  value: string | number;
  label: string;
};

/** A stored rule plus the codebook its ids are resolved against. */
export type RuleDisplayInput = {
  type: string;
  options: Record<string, unknown>;
  codebook?: unknown;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  // A plain object IS a string-keyed record; TypeScript has no narrowing for
  // that, and the guard above is the whole check.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asColorReference = (value: unknown): ColorReference | undefined => {
  const result = ColorReferenceSchema.safeParse(value);
  return result.success ? result.data : undefined;
};

/**
 * Walks a codebook path. Any missing segment — including a rule that names no
 * entity type or attribute yet — answers `undefined` rather than throwing or
 * inventing a default.
 */
const readPath = (
  root: unknown,
  path: readonly (string | undefined)[],
): unknown => {
  let current = root;
  for (const key of path) {
    if (key === undefined) return undefined;
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
};

const VARIABLE_TYPES = new Set<string>(VariableTypesKeys);

/**
 * The schema's own variable types are the only ones a pill can be rendered
 * for. An attribute the codebook does not describe — one deleted out from
 * under a rule — reports none, and the preview falls back for itself instead
 * of being handed `'string'`, a type the schema has never had.
 */
const asVariableType = (value: unknown): VariableType | undefined => {
  if (typeof value !== 'string' || !VARIABLE_TYPES.has(value)) return undefined;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as VariableType;
};

const isNodeShape = (value: unknown): value is NodeShape =>
  value === 'circle' || value === 'square' || value === 'diamond';

const asOptionItems = (value: unknown): OptionItem[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const items = value.flatMap<OptionItem>((candidate) => {
    const option = asRecord(candidate);
    const optionValue = option?.value;
    if (typeof optionValue !== 'string' && typeof optionValue !== 'number') {
      return [];
    }
    const label = option?.label;
    return [
      {
        value: optionValue,
        label: typeof label === 'string' ? label : String(optionValue),
      },
    ];
  });

  return items.length > 0 ? items : undefined;
};

const asPreviewValue = (
  value: unknown,
): PreviewTextOptions['value'] | undefined => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string | number =>
        typeof item === 'string' || typeof item === 'number',
    );
  }
  return undefined;
};

/**
 * Resolves a stored rule against the codebook into the labels, colours and
 * types its preview reads from. Shared by the rule list in the editor and by
 * the printable protocol summary.
 */
export const getRuleDisplayOptions = ({
  type,
  options,
  codebook,
}: RuleDisplayInput): PreviewTextOptions => {
  const entityType = type === 'node' ? 'node' : 'edge';
  const fallbackColor =
    entityType === 'node' ? 'node-color-seq-1' : 'edge-color-seq-1';
  const entityTypeId = asString(options.type);
  const attributeId = asString(options.attribute);
  const rawValue = options.value;

  const typeLabel = entityTypeId
    ? (asString(readPath(codebook, [entityType, entityTypeId, 'name'])) ??
      entityTypeId)
    : undefined; // noop for ego
  const typeColor = entityTypeId
    ? (asColorReference(
        readPath(codebook, [entityType, entityTypeId, 'color']),
      ) ?? fallbackColor)
    : fallbackColor; // noop for ego
  const shape = readPath(codebook, ['node', entityTypeId, 'shape', 'default']);
  // Only nodes have shapes.
  const typeShape = type === 'node' && isNodeShape(shape) ? shape : undefined;

  // An ego rule's attributes live under `ego`; an alter rule's under the
  // entity type it names, which it may not name yet.
  const variablePath = attributeId
    ? type === 'ego'
      ? ['ego', 'variables', attributeId]
      : entityTypeId
        ? [entityType, entityTypeId, 'variables', attributeId]
        : null
    : null;

  const variableLabel = variablePath
    ? (asString(readPath(codebook, [...variablePath, 'name'])) ?? attributeId)
    : attributeId;
  const variableType = variablePath
    ? asVariableType(readPath(codebook, [...variablePath, 'type']))
    : undefined;
  const variableOptions = variablePath
    ? asOptionItems(readPath(codebook, [...variablePath, 'options']))
    : undefined;

  const getOptionLabel = (item: string | number) =>
    variableOptions?.find(({ value }) => value === item)?.label ?? item;

  // A multi-select operand is a list of option VALUES; every other operand is
  // a single one. Both read back as the labels the researcher authored.
  const displayValue = () => {
    const isMultiSelect =
      variableType === 'categorical' || variableType === 'ordinal';

    if (isMultiSelect && Array.isArray(rawValue)) {
      return rawValue
        .filter(
          (item): item is string | number =>
            typeof item === 'string' || typeof item === 'number',
        )
        .map(getOptionLabel);
    }

    if (typeof rawValue === 'string' || typeof rawValue === 'number') {
      return getOptionLabel(rawValue);
    }

    return asPreviewValue(rawValue);
  };

  return {
    ...(typeLabel === undefined ? {} : { typeLabel }),
    ...(typeColor === undefined ? {} : { typeColor }),
    ...(typeShape === undefined ? {} : { typeShape }),
    type: entityTypeId,
    operator: asString(options.operator),
    attribute: variableLabel,
    variableType,
    value: displayValue(),
  };
};
