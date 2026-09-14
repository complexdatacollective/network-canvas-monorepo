import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import {
  asEntityAttributeReference,
  NodeShapes,
  type NodeDefinition,
  type NodeShape,
  type VariableType,
} from '@codaco/protocol-validation';

type ShapeMapping = NonNullable<NodeDefinition['shape']['dynamic']>;
type DiscreteShapeMapping = Extract<ShapeMapping, { type: 'discrete' }>;
type BreakpointShapeMapping = Extract<ShapeMapping, { type: 'breakpoints' }>;

type ShapeMappingType = ShapeMapping['type'];
export type DiscreteShapeMapEntry = DiscreteShapeMapping['map'][number];
export type ShapeThreshold = BreakpointShapeMapping['thresholds'][number];

/**
 * The mapping as the editor holds it, before it satisfies either variant.
 *
 * Every field is optional and `type` may be unset: a researcher who has just
 * switched the feature on has chosen nothing yet, and a mapping mid-edit is
 * still something the editor has to be able to draw and to refuse.
 */
export type ShapeMappingDraft = Partial<
  Omit<DiscreteShapeMapping, 'type'> & Omit<BreakpointShapeMapping, 'type'>
> & { type?: ShapeMappingType };

/** One answer a discrete mapping can give a shape to. */
export type ShapeMappingOption = Readonly<{
  label: string;
  value: DiscreteShapeMapEntry['value'];
}>;

/** As much of one of the type's attributes as a mapping needs to read. */
export type ShapeMappingVariable = Readonly<{
  name: string;
  type: VariableType;
  options?: readonly ShapeMappingOption[];
  validation?: Readonly<{ minValue?: number; maxValue?: number }>;
}>;

/** An eligible attribute, as the picker lists it. */
export type ShapeMappingVariableOption = Readonly<{
  value: string;
  label: string;
  type: VariableType;
}>;

const messages = defineMessages({
  needsAttribute: {
    id: 'protocolBuilder.codebookEntity.shapeMappingNeedsAttribute',
    defaultMessage:
      'Select an attribute to map to a shape, or turn off shape mapping.',
    description:
      'Refusal shown under the shape mapping of the node type editor when the mapping is switched on but names no attribute to follow.',
  },
  needsThreshold: {
    id: 'protocolBuilder.codebookEntity.shapeMappingNeedsThreshold',
    defaultMessage: 'Add at least one threshold, or turn off shape mapping.',
    description:
      'Refusal shown under the shape mapping when it follows a numeric attribute but no threshold has been set. A threshold is the value at which the shape changes.',
  },
  thresholdsAscending: {
    id: 'protocolBuilder.codebookEntity.shapeMappingThresholdsAscending',
    defaultMessage: 'Thresholds must increase in value, with no duplicates.',
    description:
      'Refusal shown under the shape mapping when its thresholds do not rise. A threshold is the value at which the shape changes.',
  },
});

/**
 * The names of the shapes a node type can be drawn as.
 *
 * One descriptor per shape rather than start-casing the schema's own token:
 * `circle` is a stored value, not copy, and upper-casing its first letter is
 * an English rule that produces an English word. The record stays exhaustive
 * over the schema union, so a shape added there fails to compile until it is
 * named here.
 */
const NODE_SHAPE_LABELS = defineMessages({
  circle: {
    id: 'protocolBuilder.codebookEntity.nodeShapeCircle',
    defaultMessage: 'Circle',
    description:
      'Choice offered for the shape a node type is drawn as in the interview. A node is a member of the interview network.',
  },
  square: {
    id: 'protocolBuilder.codebookEntity.nodeShapeSquare',
    defaultMessage: 'Square',
    description:
      'Choice offered for the shape a node type is drawn as in the interview. A node is a member of the interview network.',
  },
  diamond: {
    id: 'protocolBuilder.codebookEntity.nodeShapeDiamond',
    defaultMessage: 'Diamond',
    description:
      'Choice offered for the shape a node type is drawn as in the interview. A node is a member of the interview network.',
  },
}) satisfies Record<NodeShape, MessageDescriptor>;

/**
 * The shapes on offer, named.
 *
 * Shared by the type's default shape and by every row of its mapping, so the
 * two answers to "which shape" are given the same way.
 */
export const shapeOptions = (intl: IntlShape) =>
  NodeShapes.map((value) => ({
    value,
    label: intl.formatMessage(NODE_SHAPE_LABELS[value]),
  }));

/** The kinds of answer a shape can be chosen for, one value at a time. */
const DISCRETE_SHAPE_TYPES: ReadonlySet<VariableType> = new Set([
  'categorical',
  'ordinal',
  'boolean',
]);

/** The kinds of answer a shape can be chosen for by numeric threshold. */
const BREAKPOINT_SHAPE_TYPES: ReadonlySet<VariableType> = new Set([
  'number',
  'scalar',
]);

const isEligible = (type: VariableType): boolean =>
  DISCRETE_SHAPE_TYPES.has(type) || BREAKPOINT_SHAPE_TYPES.has(type);

/**
 * One shape band is reserved for "below the first threshold", so the shapes
 * left over cap how many thresholds can be told apart.
 */
export const MAX_SHAPE_THRESHOLDS = NodeShapes.length - 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Whether this is one of the shapes a node type can be drawn as. */
export const isNodeShape = (value: unknown): value is NodeShape =>
  NodeShapes.some((shape) => shape === value);

const isOptionValue = (
  value: unknown,
): value is DiscreteShapeMapEntry['value'] =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

const readOptions = (
  value: unknown,
): readonly ShapeMappingOption[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const options = value.flatMap((entry) =>
    isRecord(entry) &&
    typeof entry.label === 'string' &&
    isOptionValue(entry.value)
      ? [{ label: entry.label, value: entry.value }]
      : [],
  );
  return options.length === 0 ? undefined : options;
};

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * One of the type's attributes, read out of the document that carries it.
 *
 * Tolerant, because the entity draft is whatever the protocol stored: an
 * attribute that is not a record, or is missing the two facts a mapping reads,
 * is simply not one this can follow.
 */
export const shapeMappingVariables = (
  variables: unknown,
): Readonly<Record<string, ShapeMappingVariable>> => {
  if (!isRecord(variables)) return {};
  return Object.fromEntries(
    Object.entries(variables).flatMap(([id, variable]) => {
      if (!isRecord(variable)) return [];
      const { name, type } = variable;
      if (typeof name !== 'string' || typeof type !== 'string') return [];
      const validation = isRecord(variable.validation)
        ? variable.validation
        : {};
      const minValue = readNumber(validation.minValue);
      const maxValue = readNumber(validation.maxValue);
      const options = readOptions(variable.options);
      return [
        [
          id,
          {
            name,
            type: type as VariableType,
            ...(options === undefined ? {} : { options }),
            validation: {
              ...(minValue === undefined ? {} : { minValue }),
              ...(maxValue === undefined ? {} : { maxValue }),
            },
          },
        ],
      ];
    }),
  );
};

/** The attributes a shape can follow, in the order the codebook holds them. */
export const eligibleShapeVariables = (
  variables: Readonly<Record<string, ShapeMappingVariable>>,
): ShapeMappingVariableOption[] =>
  Object.entries(variables).flatMap(([id, variable]) =>
    isEligible(variable.type)
      ? [{ value: id, label: variable.name, type: variable.type }]
      : [],
  );

/**
 * The mapping as it stands, read out of the stored `shape.dynamic`.
 *
 * Read leniently for the same reason the attributes are: the editor draws what
 * the protocol has, and a mapping it cannot recognise is shown as nothing
 * chosen rather than throwing the dialog away.
 */
export const shapeMappingDraft = (value: unknown): ShapeMappingDraft => {
  if (!isRecord(value)) return {};
  const draft: ShapeMappingDraft = {};
  if (typeof value.variable === 'string') {
    draft.variable = asEntityAttributeReference(value.variable);
  }
  if (value.type === 'discrete' || value.type === 'breakpoints') {
    draft.type = value.type;
  }
  if (Array.isArray(value.map)) {
    draft.map = value.map.flatMap((entry) =>
      isRecord(entry) && isOptionValue(entry.value) && isNodeShape(entry.shape)
        ? [{ value: entry.value, shape: entry.shape }]
        : [],
    );
  }
  if (Array.isArray(value.thresholds)) {
    draft.thresholds = value.thresholds.flatMap((entry) => {
      if (!isRecord(entry) || !isNodeShape(entry.shape)) return [];
      const threshold = readNumber(entry.value);
      return threshold === undefined
        ? []
        : [{ value: threshold, shape: entry.shape }];
    });
  }
  return draft;
};

/**
 * The mapping a newly chosen attribute starts out as.
 *
 * Choosing an attribute REPLACES the mapping rather than editing it: the two
 * variants carry different keys, and a `map` left standing beside an attribute
 * whose values are numbers is a set of answers nobody can ever give.
 */
export const mappingForVariable = (
  variableId: string,
  variable: ShapeMappingVariable,
): ShapeMappingDraft =>
  DISCRETE_SHAPE_TYPES.has(variable.type)
    ? {
        variable: asEntityAttributeReference(variableId),
        type: 'discrete',
        map: [],
      }
    : {
        variable: asEntityAttributeReference(variableId),
        type: 'breakpoints',
        thresholds: [],
      };

/** The same value twice, compared as the schema compares it. */
const sameValue = (
  left: DiscreteShapeMapEntry['value'],
  right: DiscreteShapeMapEntry['value'],
): boolean => JSON.stringify(left) === JSON.stringify(right);

/** The shape this mapping gives one of the attribute's answers, if any. */
export const shapeForValue = (
  mapping: ShapeMappingDraft,
  value: DiscreteShapeMapEntry['value'],
): NodeShape | undefined =>
  mapping.map?.find((entry) => sameValue(entry.value, value))?.shape;

/** The mapping with one of the attribute's answers given a shape. */
export const withDiscreteShape = (
  mapping: ShapeMappingDraft,
  value: DiscreteShapeMapEntry['value'],
  shape: NodeShape,
): ShapeMappingDraft => {
  const map = mapping.map ?? [];
  const existing = map.findIndex((entry) => sameValue(entry.value, value));
  return {
    ...mapping,
    map:
      existing >= 0
        ? map.map((entry, index) =>
            index === existing ? { ...entry, shape } : entry,
          )
        : [...map, { value, shape }],
  };
};

/**
 * The mapping with a new set of thresholds, sorted.
 *
 * The schema requires them strictly ascending, so every change re-sorts rather
 * than refusing the researcher a value out of order while they type it.
 * `toSorted` keeps the item references, so the list's own identity tracking
 * follows a row across the sort.
 */
export const withThresholds = (
  mapping: ShapeMappingDraft,
  thresholds: readonly ShapeThreshold[],
): ShapeMappingDraft => ({
  ...mapping,
  thresholds: thresholds.toSorted((a, b) => a.value - b.value),
});

/** How the input for one threshold of this attribute is bounded. */
export const thresholdInputConfig = (
  variable: ShapeMappingVariable | undefined,
): Readonly<{ min?: number; max?: number; step: number | 'any' }> => {
  // A scalar answer is recorded on the visual analog scale's normalised 0–1
  // range, so its thresholds are fractions of one. Every other number answer
  // is bounded by whatever its own validation says.
  if (variable?.type === 'scalar') return { min: 0, max: 1, step: 0.1 };
  return {
    ...(variable?.validation?.minValue === undefined
      ? {}
      : { min: variable.validation.minValue }),
    ...(variable?.validation?.maxValue === undefined
      ? {}
      : { max: variable.validation.maxValue }),
    step: 'any',
  };
};

/** Where the next threshold added to this mapping starts. */
export const nextThresholdValue = (
  mapping: ShapeMappingDraft,
  config: ReturnType<typeof thresholdInputConfig>,
): number => {
  const existing = mapping.thresholds ?? [];
  const step = typeof config.step === 'number' ? config.step : 1;
  const base =
    existing.length > 0
      ? Math.max(...existing.map((threshold) => threshold.value)) + step
      : (config.min ?? 0);
  return config.max === undefined ? base : Math.min(base, config.max);
};

/**
 * What is wrong with this mapping, encoded rather than formatted.
 *
 * Encoded for the reason every other refusal in the entity editor is: it
 * stands from one submission until the next, which is longer than the language
 * it was written in is guaranteed to last.
 *
 * Takes the type's attributes as well as the mapping, because a mapping can
 * name an attribute no shape can follow without the researcher ever having
 * chosen one: the picker offers only the eligible attributes, but a protocol
 * whose attribute was later given a different kind of answer arrives already
 * pointing at it. Saved, the protocol refuses the whole document; refused
 * here, the researcher is told which field to fix.
 */
export const shapeMappingIssue = (
  mapping: ShapeMappingDraft | undefined,
  variables: Readonly<Record<string, ShapeMappingVariable>>,
): string | undefined => {
  if (mapping === undefined) return undefined;
  if (
    typeof mapping.variable !== 'string' ||
    mapping.variable.length === 0 ||
    mapping.type === undefined
  ) {
    return createMessageError(messages.needsAttribute);
  }
  const named = variables[mapping.variable];
  const follows =
    named !== undefined &&
    (mapping.type === 'discrete'
      ? DISCRETE_SHAPE_TYPES.has(named.type)
      : BREAKPOINT_SHAPE_TYPES.has(named.type));
  if (!follows) return createMessageError(messages.needsAttribute);
  if (mapping.type !== 'breakpoints') return undefined;

  const thresholds = mapping.thresholds ?? [];
  if (thresholds.length === 0) {
    return createMessageError(messages.needsThreshold);
  }
  return thresholds.some(
    (threshold, index) =>
      index > 0 && threshold.value <= (thresholds[index - 1]?.value ?? 0),
  )
    ? createMessageError(messages.thresholdsAscending)
    : undefined;
};
