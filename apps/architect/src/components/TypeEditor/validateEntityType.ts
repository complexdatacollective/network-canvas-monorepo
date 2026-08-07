import type * as z from 'zod/mini';

import {
  EdgeSyntheticSchema,
  NodeSyntheticSchema,
} from '@codaco/protocol-validation';

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

/**
 * The population/topology controls are unconnected, like the shape mapping,
 * so nothing they declare reaches redux-form: their native `min`/`max`/`step`
 * props are advisory, and a parameter cleared or typed out of range must
 * block the save through the form-level error instead. The codebook's own
 * schemas own those invariants — integral counts, ordered bounds, a density
 * inside 0–1 — so they are the gate here, rather than a second, drifting
 * statement of the same rules.
 */
const syntheticIssue = (synthetic: unknown): z.core.$ZodIssue | undefined => {
  if (!isRecord(synthetic)) return undefined;
  const schema =
    'topology' in synthetic ? EdgeSyntheticSchema : NodeSyntheticSchema;
  const result = schema.safeParse(synthetic);
  return result.success ? undefined : result.error.issues[0];
};

/**
 * The clause naming what is wrong with a value the author can see, as a
 * sentence fragment. Zod's own wording states the constraint the parser
 * applied ("Too big: expected number to be <=1"), which is not what the
 * author is looking at. Undefined where the draft is merely unfinished, which
 * has its own message.
 */
const syntheticIssueDetail = (issue: z.core.$ZodIssue): string | undefined => {
  // `int` is a fractional value in a whole-number field; every other type
  // mismatch is a control cleared mid-edit and not yet refilled.
  if (issue.code === 'invalid_type') {
    return issue.expected === 'int'
      ? 'counts must be whole numbers'
      : undefined;
  }
  if (issue.code === 'too_small')
    return `values must be ${issue.minimum} or more`;
  if (issue.code === 'too_big')
    return `values must be ${issue.maximum} or less`;
  // Ordered bounds are the only refinement these schemas carry.
  if (issue.code === 'custom') {
    return 'the minimum must not be greater than the maximum';
  }
  return 'check the values you have entered';
};

const validateEntityType = (
  values: Record<string, unknown>,
): EntityTypeFormErrors => {
  const issue = syntheticIssue(values.synthetic);
  if (issue) {
    const detail = syntheticIssueDetail(issue);
    return {
      _error: detail
        ? `The synthetic data settings cannot be saved: ${detail}.`
        : SYNTHETIC_INCOMPLETE_MESSAGE,
    };
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
