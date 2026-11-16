import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import {
  dynamicValueArgumentsAt,
  type DynamicValues,
  findDynamicValueProblem,
  nodeLabelValueContext,
} from '@codaco/protocol-validation';

import type { ShapeMappingType, ShapeThreshold } from './shapeMappingTypes';

/**
 * The whole shape mapping is one opaque field value, so every message it can
 * produce is keyed at that field: `DialogForm` hands the result to fresco-ui's
 * invalid-submit path, which marks the named field errored and focuses it.
 */
export const SHAPE_MAPPING_FIELD = 'shape.dynamic';

export type EntityTypeFormErrors = Record<string, string>;

const SELECT_VARIABLE_MESSAGE = defineMessages({
  message: {
    id: 'architect.constants.components.typeeditor.validateentitytype.selectVariableMessage',
    defaultMessage:
      'Select an attribute to map to a shape, or turn off shape mapping.',
    description:
      'Validation error on the shape mapping setting of the node type editor when shape mapping is on but no attribute (codebook variable) has been chosen to drive the node shape.',
  },
}).message;
const THRESHOLDS_MIN_MESSAGE = defineMessages({
  message: {
    id: 'architect.constants.components.typeeditor.validateentitytype.thresholdsMinMessage',
    defaultMessage: 'Add at least one threshold, or turn off shape mapping.',
    description:
      'Validation error on the shape mapping setting of the node type editor when breakpoint mapping is chosen but no thresholds (numeric cut-off values that select a shape) have been added.',
  },
}).message;
const THRESHOLDS_ASCENDING_MESSAGE = defineMessages({
  message: {
    id: 'architect.constants.components.typeeditor.validateentitytype.thresholdsAscendingMessage',
    defaultMessage: 'Thresholds must increase in value, with no duplicates.',
    description:
      'Validation error on the shape mapping setting of the node type editor when the thresholds (numeric cut-off values that select a shape) are not in strictly increasing order or contain a duplicate.',
  },
}).message;

/**
 * A node type's own label is one opaque field value too (its text, the
 * values the text shows and the conditions it tests), so its messages are
 * keyed at that field.
 */
export const DYNAMIC_LABEL_FIELD = 'dynamicLabel';

const LABEL_TEXT_MESSAGE = defineMessages({
  message: {
    id: 'architect.constants.components.typeeditor.validateentitytype.labelTextMessage',
    defaultMessage: 'Write the label, or turn off Dynamic label.',
    description:
      'Validation error on the Dynamic label section of the node type editor when the section is switched on but no label text has been written. Dynamic label is the name of the section and of its on/off toggle.',
  },
}).message;
const LABEL_PROBLEM_MESSAGE = defineMessages({
  message: {
    id: 'architect.constants.components.typeeditor.validateentitytype.labelProblemMessage',
    defaultMessage:
      'The label cannot be used as it is written. Correct the problem shown beneath it.',
    description:
      'Validation error on the Dynamic label section of the node type editor when the label text is not valid, for example because it shows a value in a place where the value could be missing. The specific problem is already shown directly beneath the label field.',
  },
}).message;
const CONDITION_RULES_MESSAGE = defineMessages({
  message: {
    id: 'architect.constants.components.typeeditor.validateentitytype.conditionRulesMessage',
    defaultMessage:
      'Every “If” in the label needs at least one rule. Open it and choose “Edit rules”, or remove it.',
    description:
      'Validation error on the Dynamic label section of the node type editor when an “If” in the label text has no rules. “Edit rules” is the name of the button on each row of an “If”.',
  },
}).message;

/** What the label is checked against: the codebook and the type it is for. */
export type EntityTypeValidationContext = Readonly<{
  codebook: unknown;
  /** The node type's id; undefined while a new type is being created. */
  nodeType: string | undefined;
}>;

const dynamicLabelError = (
  label: Record<string, unknown>,
  { codebook, nodeType }: EntityTypeValidationContext,
) => {
  const text = isRecord(label.text) ? label.text : {};
  const translations = Object.entries(text).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  if (translations.length === 0) return createMessageError(LABEL_TEXT_MESSAGE);

  const conditions = isRecord(label.conditions) ? label.conditions : {};
  for (const condition of Object.values(conditions)) {
    const rules =
      isRecord(condition) && Array.isArray(condition.rules)
        ? condition.rules
        : [];
    if (rules.length === 0) return createMessageError(CONDITION_RULES_MESSAGE);
  }

  // The protocol's own check, against what a label of this type can show.
  const context = nodeLabelValueContext({
    codebook,
    nodeType: nodeType ?? '',
    conditions,
  });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the field's own bindings, written only by its editor; each is read defensively by the checker
  const bindings = (
    isRecord(label.dynamicValues) ? label.dynamicValues : {}
  ) as DynamicValues;
  const values = dynamicValueArgumentsAt(bindings, context);
  return translations.some(
    ([locale, message]) =>
      findDynamicValueProblem(message, values, locale) !== undefined,
  )
    ? createMessageError(LABEL_PROBLEM_MESSAGE)
    : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isThreshold = (value: unknown): value is Pick<ShapeThreshold, 'value'> =>
  isRecord(value) && typeof value.value === 'number';

const isShapeMappingType = (value: unknown): value is ShapeMappingType =>
  value === 'discrete' || value === 'breakpoints';

const shapeMappingError = (dynamic: Record<string, unknown>) => {
  if (
    typeof dynamic.variable !== 'string' ||
    dynamic.variable.length === 0 ||
    !isShapeMappingType(dynamic.type)
  ) {
    return createMessageError(SELECT_VARIABLE_MESSAGE);
  }

  if (dynamic.type !== 'breakpoints') return undefined;

  const thresholds = Array.isArray(dynamic.thresholds)
    ? dynamic.thresholds.filter(isThreshold)
    : [];

  if (thresholds.length === 0)
    return createMessageError(THRESHOLDS_MIN_MESSAGE);

  return thresholds.some(
    (threshold, index) =>
      index > 0 && threshold.value <= (thresholds[index - 1]?.value ?? 0),
  )
    ? createMessageError(THRESHOLDS_ASCENDING_MESSAGE)
    : undefined;
};

const validateEntityType = (
  values: Record<string, unknown>,
  context: EntityTypeValidationContext = {
    codebook: undefined,
    nodeType: undefined,
  },
): EntityTypeFormErrors => {
  const errors: EntityTypeFormErrors = {};

  const shape = values.shape;
  if (isRecord(shape) && isRecord(shape.dynamic)) {
    const message = shapeMappingError(shape.dynamic);
    if (message) errors[SHAPE_MAPPING_FIELD] = message;
  }

  // Present only while the Dynamic label section is switched on.
  const label = values[DYNAMIC_LABEL_FIELD];
  if (isRecord(label)) {
    const message = dynamicLabelError(label, context);
    if (message) errors[DYNAMIC_LABEL_FIELD] = message;
  }

  return errors;
};

export default validateEntityType;
