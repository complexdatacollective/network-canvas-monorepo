// redux-form synchronous validation for the node/edge type editor. The dynamic
// shape mapping (`shape.dynamic`) is written imperatively via `change()` in
// ShapeVariableMapping and never flows through a ValidatedField, so nothing
// otherwise stops a malformed mapping from being committed to the codebook and
// then rejected by the schema-8 validator. This asserts the mapping is complete
// and well-ordered before submit, surfacing the reason and blocking the save.

type ShapeThreshold = {
  value: number;
  shape: string;
};

type ShapeDynamic = {
  variable?: unknown;
  type?: unknown;
  thresholds?: unknown;
};

export type EntityTypeFormErrors = {
  shape?: {
    dynamic?: {
      variable?: string;
      thresholds?: string;
    };
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

const isThreshold = (value: unknown): value is ShapeThreshold =>
  isRecord(value) && typeof value.value === 'number';

const validateEntityType = (
  values: Record<string, unknown>,
): EntityTypeFormErrors => {
  const shape = values.shape;
  if (!isRecord(shape) || !isRecord(shape.dynamic)) {
    return {};
  }

  const dynamic = shape.dynamic as ShapeDynamic;
  const dynamicErrors: NonNullable<
    NonNullable<EntityTypeFormErrors['shape']>['dynamic']
  > = {};

  // Gap 6: the mapping was toggled on but left incomplete. Both union arms
  // require a variable and a discriminating type; an empty `{}` matches neither.
  if (
    typeof dynamic.variable !== 'string' ||
    dynamic.variable.length === 0 ||
    (dynamic.type !== 'discrete' && dynamic.type !== 'breakpoints')
  ) {
    dynamicErrors.variable = SELECT_VARIABLE_MESSAGE;
  } else if (dynamic.type === 'breakpoints') {
    const thresholds = Array.isArray(dynamic.thresholds)
      ? dynamic.thresholds.filter(isThreshold)
      : [];
    // Gap 4: a breakpoints mapping needs at least one threshold.
    if (thresholds.length === 0) {
      dynamicErrors.thresholds = THRESHOLDS_MIN_MESSAGE;
    } else if (
      // Gap 5: thresholds must be strictly ascending, with no duplicates.
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
