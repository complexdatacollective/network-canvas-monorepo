import { z } from 'zod';

import {
  dateWithinPickerRange,
  RELATIVE_DATE_PICKER_DEFAULT_AFTER,
  RELATIVE_DATE_PICKER_DEFAULT_BEFORE,
  VariableNameSchema,
} from '@codaco/shared-consts';

import {
  findDuplicateName,
  getVariableNames,
} from '../../../utils/validation-helpers.ts';
import {
  BooleanSyntheticSchema,
  type CategoricalSynthetic,
  CategoricalSyntheticSchema,
  type DatetimeSynthetic,
  DatetimeSyntheticSchema,
  DEFAULT_OPTION_WEIGHT,
  type NumberSynthetic,
  NumberSyntheticSchema,
  optionValueKey,
  OrdinalSyntheticSchema,
  ScalarSyntheticSchema,
  type SyntheticOptionWeight,
  TextSyntheticSchema,
} from '../codebook/synthetic.ts';
import {
  type ComponentType,
  ComponentTypes,
  VariableTypes,
  type VariableType,
} from './types.ts';
import { findValidationContradictions } from './validation-contradictions.ts';
import { validations, type ValidationName } from './validation.ts';

/**
 * The validation rules a single variable type accepts. Keys are listed in the
 * order an authoring UI should offer them.
 */
type ValidationMask = Partial<Record<ValidationName, true>>;

const textValidations = {
  required: true,
  minLength: true,
  maxLength: true,
  unique: true,
  differentFrom: true,
  sameAs: true,
} as const satisfies ValidationMask;

const numberValidations = {
  required: true,
  minValue: true,
  maxValue: true,
  unique: true,
  differentFrom: true,
  sameAs: true,
  lessThanVariable: true,
  greaterThanVariable: true,
  lessThanOrEqualToVariable: true,
  greaterThanOrEqualToVariable: true,
} as const satisfies ValidationMask;

const datetimeValidations = {
  required: true,
  unique: true,
  differentFrom: true,
  sameAs: true,
  lessThanVariable: true,
  greaterThanVariable: true,
  lessThanOrEqualToVariable: true,
  greaterThanOrEqualToVariable: true,
} as const satisfies ValidationMask;

// A scalar response is recorded on a normalised 0-1 scale, so it takes no value
// bounds: `minValue`/`maxValue` are integers, making the only expressible pair
// {0, 1} — the scale it already has. The comparison rules remain, since
// comparing two scalars on the same scale is meaningful.
const scalarValidations = {
  required: true,
  lessThanVariable: true,
  greaterThanVariable: true,
  lessThanOrEqualToVariable: true,
  greaterThanOrEqualToVariable: true,
} as const satisfies ValidationMask;

const booleanValidations = {
  required: true,
  unique: true,
  differentFrom: true,
  sameAs: true,
} as const satisfies ValidationMask;

// Ordinal is single-select, so minSelected/maxSelected (which expect an array
// value) do not apply — only categorical carries them.
const ordinalValidations = {
  required: true,
  unique: true,
  differentFrom: true,
  sameAs: true,
} as const satisfies ValidationMask;

const categoricalValidations = {
  required: true,
  minSelected: true,
  maxSelected: true,
  unique: true,
  differentFrom: true,
  sameAs: true,
} as const satisfies ValidationMask;

/**
 * The single source of truth for which validation rules each variable type
 * accepts. Every variable schema below picks its `validation` shape from its
 * entry here, and an authoring UI builds its per-type rule list from the same
 * record — so a UI can never offer a rule that would fail validation.
 *
 * Layout and location variables take no validation at all.
 */
export const VARIABLE_TYPE_VALIDATIONS = {
  text: textValidations,
  number: numberValidations,
  datetime: datetimeValidations,
  scalar: scalarValidations,
  boolean: booleanValidations,
  ordinal: ordinalValidations,
  categorical: categoricalValidations,
  layout: {},
  location: {},
} as const satisfies Record<VariableType, ValidationMask>;

// The input controls each variable type can be rendered with. Every variable
// schema below builds its own `component` field from these lists, so the
// record below cannot drift from what the schemas accept.
const textComponents = [ComponentTypes.Text, ComponentTypes.TextArea] as const;
const numberComponents = [ComponentTypes.Number] as const;
const scalarComponents = [ComponentTypes.VisualAnalogScale] as const;
const ordinalComponents = [
  ComponentTypes.RadioGroup,
  ComponentTypes.LikertScale,
] as const;
const categoricalComponents = [
  ComponentTypes.CheckboxGroup,
  ComponentTypes.ToggleButtonGroup,
] as const;
// datetime and boolean each split across TWO variable schemas (the control
// determines which `parameters`/`options` shape applies), so their lists are
// declared per schema and composed into the per-type record below.
const datePickerComponents = [ComponentTypes.DatePicker] as const;
const relativeDatePickerComponents = [
  ComponentTypes.RelativeDatePicker,
] as const;
const booleanChoiceComponents = [ComponentTypes.Boolean] as const;
const booleanToggleComponents = [ComponentTypes.Toggle] as const;

/**
 * The single source of truth for which input controls each variable type can
 * be rendered with — the component counterpart of
 * `VARIABLE_TYPE_VALIDATIONS`. The variable schemas above/below build their
 * `component` fields from the same lists, and the NetworkComposer stage-field
 * check (schema.ts) reads this record to reject a stage field whose own
 * `component` cannot render the codebook variable it writes (thirteenth-wave
 * Finding 3).
 *
 * Layout and location variables have no participant-facing control at all, so
 * their lists are empty.
 */
export const VARIABLE_TYPE_COMPONENTS = {
  text: textComponents,
  number: numberComponents,
  datetime: [...datePickerComponents, ...relativeDatePickerComponents],
  scalar: scalarComponents,
  boolean: [...booleanChoiceComponents, ...booleanToggleComponents],
  ordinal: ordinalComponents,
  categorical: categoricalComponents,
  layout: [],
  location: [],
} as const satisfies Record<VariableType, readonly ComponentType[]>;

export type VariableOptions = z.infer<typeof categoricalOptionsSchema>;
export type VariableOption = VariableOptions[number];
export type VariableOptionValue = VariableOption['value'];

// Variable Schema
const baseVariableSchema = z.strictObject({
  name: VariableNameSchema,
  encrypted: z.boolean().optional(),
  // Marks a variable whose options an interface owns and the researcher may not
  // edit (e.g. a FamilyPedigree biological-sex/relationship-type/gamete-role
  // value set). Set at creation; read by the shared options editors to render
  // the options read-only.
  readOnly: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Synthetic-metadata refinements. The `synthetic` shapes live in
// ../codebook/synthetic.ts; the rules below need sibling context — validation,
// option values, date resolution — that only exists on the variable itself.
// ---------------------------------------------------------------------------

// `missingProbability` promises unanswered values; `required` forbids them.
const rejectMissingOnRequired = (
  variable: {
    validation?: { required?: boolean };
    synthetic?: { missingProbability?: number };
  },
  ctx: z.RefinementCtx,
) => {
  if (
    variable.validation?.required === true &&
    variable.synthetic?.missingProbability !== undefined
  ) {
    ctx.addIssue({
      code: 'custom' as const,
      message: 'missingProbability cannot be declared on a required variable',
      path: ['synthetic', 'missingProbability'],
    });
  }
};

// Validation bounds stay authoritative over synthetic draws (generated values
// are truncated into them), so a descriptor whose own range can never reach
// the validation window could not produce a single value — reject it.
const rejectDisjointNumberSynthetic = (
  variable: {
    validation?: { minValue?: number; maxValue?: number };
    synthetic?: NumberSynthetic;
  },
  ctx: z.RefinementCtx,
) => {
  const synthetic = variable.synthetic;
  if (!synthetic || !('distribution' in synthetic)) return;
  const lower = variable.validation?.minValue ?? Number.NEGATIVE_INFINITY;
  const upper = variable.validation?.maxValue ?? Number.POSITIVE_INFINITY;
  if (synthetic.distribution === 'constant') {
    if (synthetic.value < lower || synthetic.value > upper) {
      ctx.addIssue({
        code: 'custom' as const,
        message: `Synthetic constant ${synthetic.value} lies outside the validation bounds`,
        path: ['synthetic', 'value'],
      });
    }
    return;
  }
  if (synthetic.min !== undefined && synthetic.min > upper) {
    ctx.addIssue({
      code: 'custom' as const,
      message: 'Synthetic "min" exceeds the validation maxValue',
      path: ['synthetic', 'min'],
    });
  }
  if (synthetic.max !== undefined && synthetic.max < lower) {
    ctx.addIssue({
      code: 'custom' as const,
      message: 'Synthetic "max" is below the validation minValue',
      path: ['synthetic', 'max'],
    });
  }
};

// Weights operate on distinct typed option values (existing codebooks can
// carry duplicate stored values): an entry naming a value the options do not
// offer can never be drawn, and a table that zeroes every distinct value
// leaves nothing to draw.
const rejectInvalidOptionWeights = (
  variable: {
    options: { value: number | string }[];
    synthetic?: { optionWeights?: SyntheticOptionWeight[] };
  },
  ctx: z.RefinementCtx,
) => {
  const weights = variable.synthetic?.optionWeights;
  if (!weights) return;
  const optionKeys = new Set(
    variable.options.map((option) => optionValueKey(option.value)),
  );
  const explicit = new Map<string, number>();
  weights.forEach((entry, index) => {
    const key = optionValueKey(entry.value);
    if (!optionKeys.has(key)) {
      ctx.addIssue({
        code: 'custom' as const,
        message: `Option weight value ${JSON.stringify(entry.value)} is not one of this variable's option values`,
        path: ['synthetic', 'optionWeights', index, 'value'],
      });
    }
    explicit.set(key, entry.weight);
  });
  const allZero = [...optionKeys].every(
    (key) => (explicit.get(key) ?? DEFAULT_OPTION_WEIGHT) === 0,
  );
  if (allZero) {
    ctx.addIssue({
      code: 'custom' as const,
      message: 'At least one option value must have a positive weight',
      path: ['synthetic', 'optionWeights'],
    });
  }
};

// A selection count is sampled first and then filled by drawing distinct
// values without replacement, so every count in the table must be reachable
// under the option list, the variable's validation, and the weights it will
// draw from. At most one issue is raised per entry.
const rejectIllegalSelectionCounts = (
  variable: {
    options: { value: number | string }[];
    validation?: {
      required?: boolean;
      minSelected?: number;
      maxSelected?: number;
    };
    synthetic?: CategoricalSynthetic;
  },
  ctx: z.RefinementCtx,
) => {
  const table = variable.synthetic?.selectionCount?.probabilities;
  if (!table) return;
  const optionKeys = new Set(
    variable.options.map((option) => optionValueKey(option.value)),
  );
  const distinctCount = optionKeys.size;
  const weights = variable.synthetic?.optionWeights;
  const selectableCount = weights
    ? [...optionKeys].filter((key) => {
        const entry = weights.find(
          (candidate) => optionValueKey(candidate.value) === key,
        );
        return (entry?.weight ?? DEFAULT_OPTION_WEIGHT) > 0;
      }).length
    : distinctCount;
  const { required, minSelected, maxSelected } = variable.validation ?? {};
  table.forEach((entry, index) => {
    const path = [
      'synthetic',
      'selectionCount',
      'probabilities',
      index,
      'count',
    ];
    const issue = (message: string) =>
      ctx.addIssue({ code: 'custom' as const, message, path });
    if (entry.count === 0) {
      if (required === true) {
        issue(
          'A selection count of 0 is only legal when the variable is not required',
        );
      }
      return;
    }
    if (minSelected !== undefined && entry.count < minSelected) {
      issue(
        `Selection count ${entry.count} is below minSelected (${minSelected})`,
      );
    } else if (maxSelected !== undefined && entry.count > maxSelected) {
      issue(
        `Selection count ${entry.count} exceeds maxSelected (${maxSelected})`,
      );
    } else if (entry.count > distinctCount) {
      issue(
        `Selection count ${entry.count} exceeds the ${distinctCount} distinct option values`,
      );
    } else if (entry.count > selectableCount) {
      issue(
        `Selection count ${entry.count} exceeds the ${selectableCount} option values with positive weight`,
      );
    }
  });
};

const numberVariableSchema = baseVariableSchema
  .extend({
    type: z.literal(VariableTypes.number),
    component: z.enum(numberComponents).optional(),
    validation: z.strictObject(validations).pick(numberValidations).optional(),
    synthetic: NumberSyntheticSchema.optional(),
  })
  .superRefine(rejectMissingOnRequired)
  .superRefine(rejectDisjointNumberSynthetic);

const scalarVariableSchema = baseVariableSchema
  .extend({
    type: z.literal(VariableTypes.scalar),
    component: z.enum(scalarComponents).optional(),
    parameters: z
      .strictObject({
        minLabel: z.string().optional(),
        maxLabel: z.string().optional(),
      })
      .optional(),
    validation: z.strictObject(validations).pick(scalarValidations).optional(),
    synthetic: ScalarSyntheticSchema.optional(),
  })
  .superRefine(rejectMissingOnRequired);

export const isIsoDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Date.parse/UTC normalize impossible calendar dates (e.g. 2020-02-31 ->
  // 2020-03-02), so round-trip the components and require an exact match to
  // reject invalid days-of-month and out-of-range months. Built via
  // setUTCFullYear rather than Date.UTC(year, ...): Date.UTC (like the
  // multi-arg Date constructor) maps a 0-99 year into 1900-1999, which would
  // falsely reject a real four-digit year like '0099'; setUTCFullYear has no
  // such two-digit-year special case.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

export const DATE_RESOLUTION = {
  full: { label: 'YYYY-MM-DD', pattern: /^\d{4}-\d{2}-\d{2}$/, length: 10 },
  month: { label: 'YYYY-MM', pattern: /^\d{4}-\d{2}$/, length: 7 },
  year: { label: 'YYYY', pattern: /^\d{4}$/, length: 4 },
} as const;

export const isValidDateAtResolution = (
  value: string,
  resolution: keyof typeof DATE_RESOLUTION,
): boolean => {
  if (!DATE_RESOLUTION[resolution].pattern.test(value)) return false;
  if (resolution === 'year') return true;
  if (resolution === 'month') {
    const month = Number(value.slice(5, 7));
    return month >= 1 && month <= 12;
  }
  return isIsoDate(value);
};

// A synthetic date window is expressed at the variable's own resolution (its
// bounds compare against stored values), while a normal descriptor's mean is
// always a full YYYY-MM-DD date because its sdDays operates in days.
//
// `fieldWindow` is the window the field itself collects within, and it stays
// authoritative over synthetic draws exactly as validation bounds do for a
// number: the generator narrows its effective window by the descriptor's
// bounds and, where the two do not overlap, drops the descriptor and draws
// from the field's window instead. A synthetic window that can never reach
// the field's is therefore metadata that could never take effect — reject it
// here rather than silently ignore it at generation time, mirroring
// `rejectDisjointNumberSynthetic`. Both ends are strings at the same
// resolution, so a lexicographic comparison is date order.
const rejectInvalidDatetimeSynthetic = (
  synthetic: DatetimeSynthetic | undefined,
  resolution: keyof typeof DATE_RESOLUTION,
  fieldWindow: { min?: string; max?: string } | undefined,
  ctx: z.RefinementCtx,
) => {
  if (!synthetic || !('distribution' in synthetic)) return;
  const { label } = DATE_RESOLUTION[resolution];
  for (const bound of ['min', 'max'] as const) {
    const value = synthetic[bound];
    if (value === undefined) continue;
    if (!isValidDateAtResolution(value, resolution)) {
      ctx.addIssue({
        code: 'custom' as const,
        message: `Synthetic "${bound}" must be a valid ${label} date at this variable's resolution`,
        path: ['synthetic', bound],
      });
    }
  }
  // Only comparable bounds take part in the comparisons below; a bound at the
  // wrong resolution already carries its own issue.
  const comparable = (bound: string | undefined): string | undefined =>
    bound !== undefined && isValidDateAtResolution(bound, resolution)
      ? bound
      : undefined;
  const syntheticMin = comparable(synthetic.min);
  const syntheticMax = comparable(synthetic.max);
  const windowMin = comparable(fieldWindow?.min);
  const windowMax = comparable(fieldWindow?.max);
  if (
    syntheticMin !== undefined &&
    syntheticMax !== undefined &&
    syntheticMin > syntheticMax
  ) {
    ctx.addIssue({
      code: 'custom' as const,
      message: 'Synthetic "min" must not be after "max"',
      path: ['synthetic', 'max'],
    });
  }
  if (
    syntheticMin !== undefined &&
    windowMax !== undefined &&
    syntheticMin > windowMax
  ) {
    ctx.addIssue({
      code: 'custom' as const,
      message: 'Synthetic "min" is after the latest date this field accepts',
      path: ['synthetic', 'min'],
    });
  }
  if (
    syntheticMax !== undefined &&
    windowMin !== undefined &&
    syntheticMax < windowMin
  ) {
    ctx.addIssue({
      code: 'custom' as const,
      message: 'Synthetic "max" is before the earliest date this field accepts',
      path: ['synthetic', 'max'],
    });
  }
  if (synthetic.distribution === 'normal' && !isIsoDate(synthetic.mean)) {
    ctx.addIssue({
      code: 'custom' as const,
      message: 'Synthetic "mean" must be a full ISO date (YYYY-MM-DD)',
      path: ['synthetic', 'mean'],
    });
  }
};

// Shared with NetworkComposer's per-stage-field parameters (see
// network-composer.ts's ComposerFormFieldSchema), which lets a NetworkComposer
// form field render a DatePicker with its own min/max/resolution window
// independent of the codebook variable's own component. Exported so that
// schema can re-validate the same shape without duplicating it.
export const datePickerParametersSchema = z
  .strictObject({
    type: z.enum(['full', 'month', 'year']).optional(),
    min: z.string().optional(),
    max: z.string().optional(),
  })
  .superRefine((parameters, ctx) => {
    const resolution = parameters.type ?? 'full';
    const { label } = DATE_RESOLUTION[resolution];
    for (const bound of ['min', 'max'] as const) {
      const value = parameters[bound];
      if (value === undefined) continue;
      if (!isValidDateAtResolution(value, resolution)) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `DatePicker "${bound}" must be a valid ${label} date matching the picker's resolution`,
          path: [bound],
        });
        continue;
      }
      // Eighth-wave Finding 2: the interview runtime builds a year/month
      // resolution DatePicker's selectable year options via `y.toString()`
      // (unpadded, e.g. `99`, not `'0099'`), so a stored value ('99') and a
      // zero-padded coarse-resolution bound ('0099') would never compare
      // equal even though a full-resolution YYYY-MM-DD string is always
      // zero-padded and round-trips correctly at any year (the wave-3
      // small-year fix). Reject small years at year/month resolution only.
      if (resolution !== 'full' && Number(value.slice(0, 4)) < 1000) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `DatePicker "${bound}" must use a four-digit year of 1000 or later at year/month resolution`,
          path: [bound],
        });
      }
      // Eleventh-wave Finding 1: '0000-12-31' is a real, round-tripping ISO
      // date (JS Date supports year 0), but the native HTML date input's
      // earliest selectable date is 0001-01-01, so a year-zero bound (e.g.
      // max '0000-12-31' on a required field) leaves no selectable value
      // that can ever pass. Years 0001-0999 stay valid at full resolution
      // (the wave-3 small-year support); coarse resolutions are already
      // floored at 1000 above.
      if (resolution === 'full' && Number(value.slice(0, 4)) === 0) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `DatePicker "${bound}" must use a year of 0001 or later — the native date input starts at year 0001`,
          path: [bound],
        });
      }
    }
    if (
      parameters.min !== undefined &&
      parameters.max !== undefined &&
      isValidDateAtResolution(parameters.min, resolution) &&
      isValidDateAtResolution(parameters.max, resolution) &&
      parameters.min > parameters.max
    ) {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'DatePicker "min" must not be after "max"',
        path: ['max'],
      });
    }
  });

const dateTimeDatePickerSchema = baseVariableSchema
  .extend({
    type: z.literal(VariableTypes.datetime),
    component: z.enum(datePickerComponents).optional(),
    parameters: datePickerParametersSchema.optional(),
    validation: z
      .strictObject(validations)
      .pick(datetimeValidations)
      .optional(),
    synthetic: DatetimeSyntheticSchema.optional(),
  })
  .superRefine(rejectMissingOnRequired)
  .superRefine((variable, ctx) => {
    rejectInvalidDatetimeSynthetic(
      variable.synthetic,
      variable.parameters?.type ?? 'full',
      variable.parameters,
      ctx,
    );
  });

// Shared with NetworkComposer's per-stage-field parameters, mirroring
// `datePickerParametersSchema` above.
export const relativeDatePickerParametersSchema = z
  .strictObject({
    anchor: z.string().optional(),
    before: z.number().int().optional(),
    after: z.number().int().optional(),
  })
  .superRefine((parameters, ctx) => {
    if (parameters.anchor !== undefined) {
      if (!isIsoDate(parameters.anchor)) {
        ctx.addIssue({
          code: 'custom' as const,
          message:
            'RelativeDatePicker anchor must be a valid ISO date (YYYY-MM-DD)',
          path: ['anchor'],
        });
      } else if (Number(parameters.anchor.slice(0, 4)) === 0) {
        ctx.addIssue({
          code: 'custom' as const,
          message:
            'RelativeDatePicker anchor must use a year of 0001 or later — the native date input starts at year 0001',
          path: ['anchor'],
        });
      }
    }
    if (parameters.before !== undefined && parameters.before < 0) {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'RelativeDatePicker "before" must not be negative',
        path: ['before'],
      });
    }
    if (parameters.after !== undefined && parameters.after < 0) {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'RelativeDatePicker "after" must not be negative',
        path: ['after'],
      });
    }
    // `before` and `after` are independent non-negative offsets in opposite
    // directions from the anchor (earliest = anchor - before, latest =
    // anchor + after; see RelativeDatePicker, default before=180/after=0), so
    // there is no `before < after` relationship to enforce.
  });

const dateTimeRelativeDatePickerSchema = baseVariableSchema
  .extend({
    type: z.literal(VariableTypes.datetime),
    component: z.enum(relativeDatePickerComponents).optional(),
    parameters: relativeDatePickerParametersSchema.optional(),
    validation: z
      .strictObject(validations)
      .pick(datetimeValidations)
      .optional(),
    synthetic: DatetimeSyntheticSchema.optional(),
  })
  .superRefine(rejectMissingOnRequired)
  .superRefine((variable, ctx) => {
    // RelativeDatePicker stores full-resolution dates, and its window is
    // derived from `anchor` ± `before`/`after` rather than declared. An
    // omitted anchor is the interview date, so the window moves with the run
    // and cannot make a stored protocol invalid — but a declared anchor fixes
    // it, and synthetic bounds outside a fixed window are bounds the generator
    // silently ignores. Derived through the same shared helper the runtime and
    // the generator both use, so there is no second reading of the window.
    const anchor = variable.parameters?.anchor;
    const fieldWindow =
      anchor === undefined || !isIsoDate(anchor)
        ? undefined
        : {
            min: dateWithinPickerRange(
              anchor,
              -(
                variable.parameters?.before ??
                RELATIVE_DATE_PICKER_DEFAULT_BEFORE
              ),
            ),
            max: dateWithinPickerRange(
              anchor,
              variable.parameters?.after ?? RELATIVE_DATE_PICKER_DEFAULT_AFTER,
            ),
          };
    rejectInvalidDatetimeSynthetic(
      variable.synthetic,
      'full',
      fieldWindow,
      ctx,
    );
  });

const textVariableSchema = baseVariableSchema
  .extend({
    type: z.literal(VariableTypes.text),
    component: z.enum(textComponents).optional(),
    validation: z.strictObject(validations).pick(textValidations).optional(),
    synthetic: TextSyntheticSchema.optional(),
  })
  .superRefine(rejectMissingOnRequired);

// Thirteenth-wave Finding 2: an explicitly empty array is not the same as no
// `options` at all. fresco-ui's BooleanField defaults to Yes/No only when the
// prop is `undefined` (a destructuring default), so `options: []` renders a
// control with no buttons — unanswerable, and fatal on a required variable.
// `findValidationContradictions`'s `booleanDomain` models the same
// distinction.
//
// Twenty-eighth-wave Finding 1: that only holds once `component: 'Boolean'`
// IS this variable's own rendering — the refinement below anchors the
// rejection there. A componentless boolean is renderable by EITHER control
// `VARIABLE_TYPE_COMPONENTS['boolean']` lists (`Boolean` and `Toggle`; see
// `rejectValidationContradictions`'s Twenty-first/Twenty-sixth-wave findings
// above `booleanDomain`), and which one a participant actually sees is
// decided solely by the rendering surface — a NetworkComposer field's own
// required `component`, independent of the codebook — which this SHAPE rule
// (run per-variable, with no stage in scope) can never know. Rejecting
// `options: []` here for a componentless variable exclusively rendered by
// `Toggle` (which takes no `options` prop and is unconditionally two-valued)
// is a false rejection, and blocked identical v7 protocols from importing
// before the strip below existed. The empty-array rejection is therefore
// scoped to variables that EXPLICITLY declare `component: 'Boolean'`
// themselves — their own declared rendering needs the options it can never
// fill. The genuinely broken stage-level case — a NetworkComposer field that
// RENDERS a boolean through the `Boolean` control over a variable whose
// options are empty, whatever the codebook declares — is instead caught in
// schema.ts's `validateComposerFieldComponents`, where the rendering is
// actually known.
const booleanOptionsSchema = z.array(
  z.strictObject({
    label: z.string(),
    value: z.boolean(),
    negative: z.boolean().optional(),
  }),
);

const booleanBooleanVariableSchema = baseVariableSchema
  .extend({
    type: z.literal(VariableTypes.boolean),
    component: z.enum(booleanChoiceComponents).optional(),
    validation: z.strictObject(validations).pick(booleanValidations).optional(),
    options: booleanOptionsSchema.optional(), // This is different from the categorical options!
    synthetic: BooleanSyntheticSchema.optional(),
  })
  .superRefine(rejectMissingOnRequired)
  .superRefine((variable, ctx) => {
    if (
      variable.component === ComponentTypes.Boolean &&
      variable.options !== undefined &&
      variable.options.length === 0
    ) {
      ctx.addIssue({
        code: 'custom' as const,
        message:
          'Boolean options must offer at least one choice when component is "Boolean"',
        path: ['options'],
      });
    }
  });

const booleanToggleVariableSchema = baseVariableSchema
  .extend({
    type: z.literal(VariableTypes.boolean),
    component: z.enum(booleanToggleComponents).optional(),
    validation: z.strictObject(validations).pick(booleanValidations).optional(),
    synthetic: BooleanSyntheticSchema.optional(),
  })
  .superRefine(rejectMissingOnRequired);

// Options Schema for categorical and ordinal variables. Option values are
// strings or integers — booleans are not selectable option values (a migration
// coerces any legacy boolean values to strings). A binning stage needs at least
// two options to be usable, so require a minimum of two.
const categoricalOptionsSchema = z
  .array(
    z.strictObject({
      label: z.string(),
      value: z.union([z.number().int(), z.string()]),
    }),
  )
  .min(2);

const ordinalVariableSchema = baseVariableSchema
  .extend({
    type: z.literal(VariableTypes.ordinal),
    component: z.enum(ordinalComponents).optional(),
    options: categoricalOptionsSchema,
    validation: z.strictObject(validations).pick(ordinalValidations).optional(),
    synthetic: OrdinalSyntheticSchema.optional(),
  })
  .superRefine(rejectMissingOnRequired)
  .superRefine(rejectInvalidOptionWeights);

const categoricalVariableSchema = baseVariableSchema
  .extend({
    type: z.literal(VariableTypes.categorical),
    component: z.enum(categoricalComponents).optional(),
    options: categoricalOptionsSchema,
    validation: z
      .strictObject(validations)
      .pick(categoricalValidations)
      .optional(),
    synthetic: CategoricalSyntheticSchema.optional(),
  })
  .superRefine(rejectMissingOnRequired)
  .superRefine(rejectInvalidOptionWeights)
  .superRefine(rejectIllegalSelectionCounts);

const layoutVariableSchema = baseVariableSchema.extend({
  type: z.literal(VariableTypes.layout),
});

const locationVariableSchema = baseVariableSchema.extend({
  type: z.literal(VariableTypes.location),
});

const variableSchemas = [
  textVariableSchema,
  numberVariableSchema,
  scalarVariableSchema,
  booleanBooleanVariableSchema,
  booleanToggleVariableSchema,
  ordinalVariableSchema,
  categoricalVariableSchema,
  dateTimeDatePickerSchema,
  dateTimeRelativeDatePickerSchema,
  layoutVariableSchema,
  locationVariableSchema,
] as const;
export const VariableSchema = z.union([...variableSchemas]);

export type Variable = z.infer<typeof VariableSchema>;

type VariablesRecord = Record<string, Variable>;

// `encrypted` is only meaningful on node text variables: decryption returns a
// string (so non-text values come back mistyped) and the ego/edge write paths
// never apply encryption. Reject it everywhere else; a migration strips it.
const rejectEncryptedOnNonTextNode = (
  variables: VariablesRecord,
  ctx: z.RefinementCtx,
) => {
  for (const [key, variable] of Object.entries(variables)) {
    if (variable.encrypted && variable.type !== 'text') {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'Only text variables can be encrypted',
        path: [key, 'encrypted'],
      });
    }
  }
};

const rejectEncrypted =
  (entity: 'Ego' | 'Edge') =>
  (variables: VariablesRecord, ctx: z.RefinementCtx) => {
    for (const [key, variable] of Object.entries(variables)) {
      if (variable.encrypted) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `${entity} variables cannot be encrypted`,
          path: [key, 'encrypted'],
        });
      }
    }
  };

// Ego variables cannot use 'unique' validation — the interview's unique check
// throws for the ego entity. A migration strips it from existing protocols.
const rejectEgoUnique = (variables: VariablesRecord, ctx: z.RefinementCtx) => {
  for (const [key, variable] of Object.entries(variables)) {
    if (
      'validation' in variable &&
      variable.validation &&
      'unique' in variable.validation &&
      variable.validation.unique
    ) {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'Ego variables cannot use the "unique" validation',
        path: [key, 'validation', 'unique'],
      });
    }
  }
};

// Contradictory validation-rule combinations (inverted bounds, impossible
// reference structures, disjoint bounds) are rejected at the record level —
// the analyser needs every sibling variable in scope. The v7→v8 migration
// strips the same combinations from existing protocols.
const rejectValidationContradictions = (
  variables: VariablesRecord,
  ctx: z.RefinementCtx,
) => {
  for (const contradiction of findValidationContradictions(variables)) {
    const anchor = contradiction.strips[0];
    ctx.addIssue({
      code: 'custom' as const,
      message: contradiction.message,
      path: [anchor.variableId, 'validation', anchor.rule],
    });
  }
};

type AllKeys<T> = T extends unknown ? keyof T : never;
export type VariablePropertyKey = AllKeys<Variable>;

type AllValues<T> = T extends unknown ? T[keyof T] : never;
export type VariablePropertyValue = AllValues<Variable>;

const checkDuplicateVariableNames = <T extends Record<string, Variable>>(
  variables: T,
  ctx: z.RefinementCtx,
) => {
  const variableNames = getVariableNames(variables);
  const duplicateVarName = findDuplicateName(variableNames);
  if (duplicateVarName) {
    ctx.addIssue({
      code: 'custom' as const,
      message: `Duplicate variable name "${duplicateVarName}"`,
      path: [],
    });
  }
};
export const VariablesSchema = z
  .record(VariableNameSchema, VariableSchema)
  .superRefine(checkDuplicateVariableNames)
  .superRefine(rejectEncryptedOnNonTextNode)
  .superRefine(rejectValidationContradictions);

export const EdgeVariablesSchema = z
  .record(VariableNameSchema, VariableSchema)
  .superRefine(checkDuplicateVariableNames)
  .superRefine(rejectEncrypted('Edge'))
  .superRefine(rejectValidationContradictions);

export const EgoVariablesSchema = z
  .record(VariableNameSchema, VariableSchema)
  .superRefine(checkDuplicateVariableNames)
  .superRefine(rejectEncrypted('Ego'))
  .superRefine(rejectEgoUnique)
  .superRefine(rejectValidationContradictions);
export type Variables = z.infer<typeof VariablesSchema>;
