import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import {
  customShapesIssue,
  defaultShapeIssue,
  mappedShapesIssue,
  readCustomShapes,
} from '@codaco/protocol-builder/codebook/customShapes';

import type { ShapeMappingType, ShapeThreshold } from './shapeMappingTypes';

/**
 * The whole shape mapping is one opaque field value, so every message it can
 * produce is keyed at that field: `DialogForm` hands the result to fresco-ui's
 * invalid-submit path, which marks the named field errored and focuses it.
 */
export const SHAPE_MAPPING_FIELD = 'shape.dynamic';
export const CUSTOM_SHAPES_FIELD = 'customShapes';
const DEFAULT_SHAPE_FIELD = 'shape.default';

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
): EntityTypeFormErrors => {
  const errors: EntityTypeFormErrors = {};
  const customShapes = readCustomShapes(values.customShapes);
  const shapesMessage = customShapesIssue(customShapes);
  if (shapesMessage) errors[CUSTOM_SHAPES_FIELD] = shapesMessage;

  const shape = values.shape;
  if (!isRecord(shape)) return errors;

  const defaultMessage = defaultShapeIssue(shape.default, customShapes);
  if (defaultMessage) errors[DEFAULT_SHAPE_FIELD] = defaultMessage;

  if (isRecord(shape.dynamic)) {
    const mappingMessage =
      shapeMappingError(shape.dynamic) ??
      mappedShapesIssue(shape.dynamic, customShapes);
    if (mappingMessage) errors[SHAPE_MAPPING_FIELD] = mappingMessage;
  }
  return errors;
};

export default validateEntityType;
