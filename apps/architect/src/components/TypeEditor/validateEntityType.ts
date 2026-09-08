import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';

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
      'Researcher-facing status or validation message. Context: components/TypeEditor/validateEntityType.ts.',
  },
}).message;
const THRESHOLDS_MIN_MESSAGE = defineMessages({
  message: {
    id: 'architect.constants.components.typeeditor.validateentitytype.thresholdsMinMessage',
    defaultMessage: 'Add at least one threshold, or turn off shape mapping.',
    description:
      'Researcher-facing status or validation message. Context: components/TypeEditor/validateEntityType.ts.',
  },
}).message;
const THRESHOLDS_ASCENDING_MESSAGE = defineMessages({
  message: {
    id: 'architect.constants.components.typeeditor.validateentitytype.thresholdsAscendingMessage',
    defaultMessage: 'Thresholds must increase in value, with no duplicates.',
    description:
      'Researcher-facing status or validation message. Context: components/TypeEditor/validateEntityType.ts.',
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
  const shape = values.shape;
  if (!isRecord(shape) || !isRecord(shape.dynamic)) {
    return {};
  }

  const message = shapeMappingError(shape.dynamic);
  return message ? { [SHAPE_MAPPING_FIELD]: message } : {};
};

export default validateEntityType;
