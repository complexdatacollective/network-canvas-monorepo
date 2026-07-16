import { z } from 'zod';

import { VariableNameSchema } from '@codaco/shared-consts';

import {
  findDuplicateName,
  getVariableNames,
} from '../../../utils/validation-helpers.ts';
import { ComponentTypes, VariableTypes } from './types.ts';
import { validations } from './validation.ts';

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

const numberVariableSchema = baseVariableSchema.extend({
  type: z.literal(VariableTypes.number),
  component: z.literal(ComponentTypes.Number).optional(),
  validation: z
    .strictObject(validations)
    .pick({
      required: true,
      minValue: true,
      maxValue: true,
      sameAs: true,
      unique: true,
      differentFrom: true,
      greaterThanVariable: true,
      lessThanVariable: true,
      greaterThanOrEqualToVariable: true,
      lessThanOrEqualToVariable: true,
    })
    .optional(),
});

const scalarVariableSchema = baseVariableSchema.extend({
  type: z.literal(VariableTypes.scalar),
  component: z.literal(ComponentTypes.VisualAnalogScale).optional(),
  parameters: z
    .strictObject({
      minLabel: z.string().optional(),
      maxLabel: z.string().optional(),
    })
    .optional(),
  validation: z
    .strictObject(validations)
    .pick({
      required: true,
      minValue: true,
      maxValue: true,
      greaterThanVariable: true,
      lessThanVariable: true,
      greaterThanOrEqualToVariable: true,
      lessThanOrEqualToVariable: true,
    })
    .optional(),
});

const dateTimeDatePickerSchema = baseVariableSchema.extend({
  type: z.literal(VariableTypes.datetime),
  component: z.literal(ComponentTypes.DatePicker).optional(),
  parameters: z
    .strictObject({
      type: z.enum(['full', 'month', 'year']).optional(),
      min: z.string().optional(),
      max: z.string().optional(),
    })
    .optional(),
  validation: z
    .strictObject(validations)
    .pick({
      required: true,
      sameAs: true,
      unique: true,
      differentFrom: true,
      greaterThanVariable: true,
      lessThanVariable: true,
      greaterThanOrEqualToVariable: true,
      lessThanOrEqualToVariable: true,
    })
    .optional(),
});

const isIsoDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Date.parse/UTC normalize impossible calendar dates (e.g. 2020-02-31 ->
  // 2020-03-02), so round-trip the components and require an exact match to
  // reject invalid days-of-month and out-of-range months.
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const dateTimeRelativeDatePickerSchema = baseVariableSchema.extend({
  type: z.literal(VariableTypes.datetime),
  component: z.literal(ComponentTypes.RelativeDatePicker).optional(),
  parameters: z
    .strictObject({
      anchor: z.string().optional(),
      before: z.number().int().optional(),
      after: z.number().int().optional(),
    })
    .superRefine((parameters, ctx) => {
      if (parameters.anchor !== undefined && !isIsoDate(parameters.anchor)) {
        ctx.addIssue({
          code: 'custom' as const,
          message:
            'RelativeDatePicker anchor must be a valid ISO date (YYYY-MM-DD)',
          path: ['anchor'],
        });
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
    })
    .optional(),
  validation: z
    .strictObject(validations)
    .pick({
      required: true,
      sameAs: true,
      unique: true,
      differentFrom: true,
      greaterThanVariable: true,
      lessThanVariable: true,
      greaterThanOrEqualToVariable: true,
      lessThanOrEqualToVariable: true,
    })
    .optional(),
});

const textVariableSchema = baseVariableSchema.extend({
  type: z.literal(VariableTypes.text),
  component: z.enum([ComponentTypes.Text, ComponentTypes.TextArea]).optional(),
  validation: z
    .strictObject(validations)
    .pick({
      required: true,
      minLength: true,
      maxLength: true,
      sameAs: true,
      unique: true,
      differentFrom: true,
    })
    .optional(),
});

const booleanOptionsSchema = z.array(
  z.strictObject({
    label: z.string(),
    value: z.boolean(),
    negative: z.boolean().optional(),
  }),
);

const booleanBooleanVariableSchema = baseVariableSchema.extend({
  type: z.literal(VariableTypes.boolean),
  component: z.literal(ComponentTypes.Boolean).optional(),
  validation: z
    .strictObject(validations)
    .pick({
      required: true,
      sameAs: true,
      unique: true,
      differentFrom: true,
    })
    .optional(),
  options: booleanOptionsSchema.optional(), // This is different from the categorical options!
});

const booleanToggleVariableSchema = baseVariableSchema.extend({
  type: z.literal(VariableTypes.boolean),
  component: z.literal(ComponentTypes.Toggle).optional(),
  validation: z
    .strictObject(validations)
    .pick({
      required: true,
      sameAs: true,
      unique: true,
      differentFrom: true,
    })
    .optional(),
});

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

const ordinalVariableSchema = baseVariableSchema.extend({
  type: z.literal(VariableTypes.ordinal),
  component: z
    .enum([ComponentTypes.RadioGroup, ComponentTypes.LikertScale])
    .optional(),
  options: categoricalOptionsSchema,
  // Ordinal is single-select, so minSelected/maxSelected (which expect an
  // array value) do not apply — only categorical carries them.
  validation: z
    .strictObject(validations)
    .pick({
      required: true,
      sameAs: true,
      unique: true,
      differentFrom: true,
    })
    .optional(),
});

const categoricalVariableSchema = baseVariableSchema.extend({
  type: z.literal(VariableTypes.categorical),
  component: z
    .enum([ComponentTypes.CheckboxGroup, ComponentTypes.ToggleButtonGroup])
    .optional(),
  options: categoricalOptionsSchema,
  validation: z
    .strictObject(validations)
    .pick({
      required: true,
      minSelected: true,
      maxSelected: true,
      sameAs: true,
      unique: true,
      differentFrom: true,
    })
    .optional(),
});

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
  .superRefine(rejectEncryptedOnNonTextNode);

export const EdgeVariablesSchema = z
  .record(VariableNameSchema, VariableSchema)
  .superRefine(checkDuplicateVariableNames)
  .superRefine(rejectEncrypted('Edge'));

export const EgoVariablesSchema = z
  .record(VariableNameSchema, VariableSchema)
  .superRefine(checkDuplicateVariableNames)
  .superRefine(rejectEncrypted('Ego'))
  .superRefine(rejectEgoUnique);
export type Variables = z.infer<typeof VariablesSchema>;
