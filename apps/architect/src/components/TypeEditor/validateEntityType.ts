import type { ShapeMappingType, ShapeThreshold } from './shapeMappingTypes';

export type EntityTypeFormErrors = {
  // redux-form's isValid only inspects errors on *registered* fields, and the
  // shape mapping is built from unconnected controls. The form-level _error is
  // what actually makes the form invalid and blocks the save.
  _error?: string;
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
const SHAPE_MAPPING_INCOMPLETE_MESSAGE =
  'Finish the shape mapping, or turn off shape mapping, before saving.';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isThreshold = (value: unknown): value is Pick<ShapeThreshold, 'value'> =>
  isRecord(value) && typeof value.value === 'number';

const isShapeMappingType = (value: unknown): value is ShapeMappingType =>
  value === 'discrete' || value === 'breakpoints';

const SYNTHETIC_INCOMPLETE_MESSAGE =
  'Finish the synthetic data settings, or turn the section off, before saving.';

// The population/topology controls are unconnected, like the shape mapping,
// so a numeric parameter cleared mid-edit must block the save through the
// form-level error rather than a registered-field error.
const syntheticIsIncomplete = (synthetic: unknown): boolean => {
  if (!isRecord(synthetic)) return false;
  const descriptor = isRecord(synthetic.count)
    ? synthetic.count
    : isRecord(synthetic.topology) && isRecord(synthetic.topology.distribution)
      ? synthetic.topology.distribution
      : undefined;
  if (!descriptor) return false;
  switch (descriptor.distribution) {
    case 'constant':
      return typeof descriptor.value !== 'number';
    case 'uniform':
      return (
        typeof descriptor.min !== 'number' || typeof descriptor.max !== 'number'
      );
    case 'poisson':
      return typeof descriptor.mean !== 'number';
    case 'normal':
      return (
        typeof descriptor.mean !== 'number' || typeof descriptor.sd !== 'number'
      );
    default:
      return true;
  }
};

const validateEntityType = (
  values: Record<string, unknown>,
): EntityTypeFormErrors => {
  if (syntheticIsIncomplete(values.synthetic)) {
    return { _error: SYNTHETIC_INCOMPLETE_MESSAGE };
  }

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

  return {
    _error: SHAPE_MAPPING_INCOMPLETE_MESSAGE,
    shape: { dynamic: dynamicErrors },
  };
};

export default validateEntityType;
