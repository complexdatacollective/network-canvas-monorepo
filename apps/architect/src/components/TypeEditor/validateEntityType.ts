import type { ShapeMappingType, ShapeThreshold } from './shapeMappingTypes';

export type EntityTypeFormErrors = {
  shape?: {
    dynamic?: Partial<Record<'variable' | 'thresholds', string>>;
  };
};

const SELECT_VARIABLE_MESSAGE =
  'Select a variable to map to a shape, or turn off shape mapping.';
const THRESHOLDS_MIN_MESSAGE =
  'Add at least one threshold, or turn off shape mapping.';
const THRESHOLDS_ASCENDING_MESSAGE =
  'Thresholds must increase in value, with no duplicates.';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isThreshold = (value: unknown): value is Pick<ShapeThreshold, 'value'> =>
  isRecord(value) && typeof value.value === 'number';

const isShapeMappingType = (value: unknown): value is ShapeMappingType =>
  value === 'discrete' || value === 'breakpoints';

const validateEntityType = (
  values: Record<string, unknown>,
): EntityTypeFormErrors => {
  const shape = values.shape;
  if (!isRecord(shape) || !isRecord(shape.dynamic)) {
    return {};
  }

  const dynamic = shape.dynamic;
  const dynamicErrors: NonNullable<
    NonNullable<EntityTypeFormErrors['shape']>['dynamic']
  > = {};

  if (
    typeof dynamic.variable !== 'string' ||
    dynamic.variable.length === 0 ||
    !isShapeMappingType(dynamic.type)
  ) {
    dynamicErrors.variable = SELECT_VARIABLE_MESSAGE;
  } else if (dynamic.type === 'breakpoints') {
    const thresholds = Array.isArray(dynamic.thresholds)
      ? dynamic.thresholds.filter(isThreshold)
      : [];
    if (thresholds.length === 0) {
      dynamicErrors.thresholds = THRESHOLDS_MIN_MESSAGE;
    } else if (
      thresholds.some(
        (threshold, index) =>
          index > 0 && threshold.value <= (thresholds[index - 1]?.value ?? 0),
      )
    ) {
      dynamicErrors.thresholds = THRESHOLDS_ASCENDING_MESSAGE;
    }
  }

  if (Object.keys(dynamicErrors).length === 0) {
    return {};
  }

  return { shape: { dynamic: dynamicErrors } };
};

export default validateEntityType;
