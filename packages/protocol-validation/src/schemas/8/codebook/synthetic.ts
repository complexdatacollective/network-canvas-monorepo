import { z } from 'zod';

/**
 * Optional synthetic-data generation metadata (`synthetic`) carried by
 * codebook entity and variable definitions. Purely descriptive: it shapes
 * what generated sample data looks like and never affects how an interview
 * collects real data. Everything here is additive — a protocol that omits it
 * is unchanged, and generation resolves documented defaults instead.
 *
 * Modelling rules the shapes below enforce:
 *
 * - Distributions are discriminated unions on `distribution`, so a family
 *   only accepts its own parameters.
 * - An explicit `uniform` descriptor requires `min`/`max` except where the
 *   value domain supplies them (scalar and density are 0–1; datetime falls
 *   back to the variable's effective date window).
 * - `missingProbability` may always stand alone: every variable-level shape
 *   accepts a missing-only declaration. Its incompatibility with
 *   `validation.required`, and every rule that needs sibling context
 *   (option values, date resolution, validation bounds), is enforced where
 *   that context is in scope — the per-variable refinements in variable.ts —
 *   not here.
 * - Option weights are RELATIVE weights over distinct typed option values;
 *   an option value not listed receives {@link DEFAULT_OPTION_WEIGHT}.
 *   Typed identity matters: the number 1 and the string "1" are different
 *   option values.
 */

const probabilitySchema = z.number().min(0).max(1);

/** Relative weight an option value receives when `optionWeights` omits it. */
export const DEFAULT_OPTION_WEIGHT = 1;

/** Allowed |sum − 1| drift for a selection-count probability table. */
export const SELECTION_COUNT_PROBABILITY_TOLERANCE = 1e-6;

const requireOrderedBounds = (
  bounds: { min?: number; max?: number },
  ctx: z.RefinementCtx,
) => {
  if (
    bounds.min !== undefined &&
    bounds.max !== undefined &&
    bounds.min > bounds.max
  ) {
    ctx.addIssue({
      code: 'custom' as const,
      message: '"min" must not be greater than "max"',
      path: ['max'],
    });
  }
};

// A synthetic block with no declared property says nothing and cannot be
// distinguished from "use defaults" — reject it rather than store it.
const requireSomeField = (
  value: Record<string, unknown>,
  ctx: z.RefinementCtx,
) => {
  if (Object.values(value).every((entry) => entry === undefined)) {
    ctx.addIssue({
      code: 'custom' as const,
      message: 'A synthetic block must declare at least one property',
      path: [],
    });
  }
};

// ---------------------------------------------------------------------------
// Entity level: node population counts
// ---------------------------------------------------------------------------

/**
 * The most people one node type may be asked to produce.
 *
 * A synthetic population is generated SYNCHRONOUSLY — Architect's PreviewHost
 * calls `generateNetwork` on the main thread, and the planner iterates once per
 * node and once per pair. A count of a billion is arithmetically fine and
 * schema-valid, and it locks the renderer. Ten thousand is far past any
 * plausible interview and still returns.
 */
export const MAX_SYNTHETIC_POPULATION = 10_000;

const nonNegativeInt = z.number().int().min(0);
const populationInt = nonNegativeInt.max(MAX_SYNTHETIC_POPULATION);

const constantCountSchema = z.strictObject({
  distribution: z.literal('constant'),
  value: populationInt,
});

const uniformCountSchema = z
  .strictObject({
    distribution: z.literal('uniform'),
    min: populationInt,
    max: populationInt,
  })
  .superRefine(requireOrderedBounds);

const poissonCountSchema = z
  .strictObject({
    distribution: z.literal('poisson'),
    mean: z.number().min(0).max(MAX_SYNTHETIC_POPULATION),
    min: populationInt.optional(),
    max: populationInt.optional(),
  })
  .superRefine(requireOrderedBounds);

// A negative mean stays representable: truncation and rounding keep drawn
// counts non-negative integers, so "usually zero, occasionally more" is a
// legitimate parameterisation.
const normalCountSchema = z
  .strictObject({
    distribution: z.literal('normal'),
    mean: z.number().max(MAX_SYNTHETIC_POPULATION),
    sd: z.number().min(0).max(MAX_SYNTHETIC_POPULATION),
    min: populationInt.optional(),
    max: populationInt.optional(),
  })
  .superRefine(requireOrderedBounds);

export const SyntheticCountSchema = z.discriminatedUnion('distribution', [
  constantCountSchema,
  uniformCountSchema,
  poissonCountSchema,
  normalCountSchema,
]);
export type SyntheticCount = z.infer<typeof SyntheticCountSchema>;

export const NodeSyntheticSchema = z.strictObject({
  count: SyntheticCountSchema,
});
export type NodeSynthetic = z.infer<typeof NodeSyntheticSchema>;

// ---------------------------------------------------------------------------
// Entity level: edge topology
// ---------------------------------------------------------------------------

// Density is probability-like: every parameter lives in 0–1, and uniform
// bounds may be omitted because the domain supplies them.
const densityConstantSchema = z.strictObject({
  distribution: z.literal('constant'),
  value: probabilitySchema,
});

const densityUniformSchema = z
  .strictObject({
    distribution: z.literal('uniform'),
    min: probabilitySchema.optional(),
    max: probabilitySchema.optional(),
  })
  .superRefine(requireOrderedBounds);

const densityNormalSchema = z
  .strictObject({
    distribution: z.literal('normal'),
    mean: probabilitySchema,
    sd: z.number().min(0),
    min: probabilitySchema.optional(),
    max: probabilitySchema.optional(),
  })
  .superRefine(requireOrderedBounds);

const densityDistributionSchema = z.discriminatedUnion('distribution', [
  densityConstantSchema,
  densityUniformSchema,
  densityNormalSchema,
]);

const nonNegative = z.number().min(0);

const meanDegreeConstantSchema = z.strictObject({
  distribution: z.literal('constant'),
  value: nonNegative,
});

const meanDegreeUniformSchema = z
  .strictObject({
    distribution: z.literal('uniform'),
    min: nonNegative,
    max: nonNegative,
  })
  .superRefine(requireOrderedBounds);

const meanDegreeNormalSchema = z
  .strictObject({
    distribution: z.literal('normal'),
    mean: z.number(),
    sd: z.number().min(0),
    min: nonNegative.optional(),
    max: nonNegative.optional(),
  })
  .superRefine(requireOrderedBounds);

const meanDegreeDistributionSchema = z.discriminatedUnion('distribution', [
  meanDegreeConstantSchema,
  meanDegreeUniformSchema,
  meanDegreeNormalSchema,
]);

export const EdgeTopologySchema = z.discriminatedUnion('metric', [
  z.strictObject({
    metric: z.literal('density'),
    distribution: densityDistributionSchema,
  }),
  z.strictObject({
    metric: z.literal('meanDegree'),
    distribution: meanDegreeDistributionSchema,
  }),
]);
export type EdgeTopology = z.infer<typeof EdgeTopologySchema>;

export const EdgeSyntheticSchema = z.strictObject({
  topology: EdgeTopologySchema,
});
export type EdgeSynthetic = z.infer<typeof EdgeSyntheticSchema>;

// ---------------------------------------------------------------------------
// Variable level
// ---------------------------------------------------------------------------

// Missingness may be declared without a value distribution on any supported
// variable type, so union-shaped types carry this extra branch.
const missingOnlySchema = z.strictObject({
  missingProbability: probabilitySchema,
});

const numberConstantSchema = z.strictObject({
  distribution: z.literal('constant'),
  value: z.number(),
  missingProbability: probabilitySchema.optional(),
});

const numberUniformSchema = z
  .strictObject({
    distribution: z.literal('uniform'),
    min: z.number(),
    max: z.number(),
    missingProbability: probabilitySchema.optional(),
  })
  .superRefine(requireOrderedBounds);

const numberNormalSchema = z
  .strictObject({
    distribution: z.literal('normal'),
    mean: z.number(),
    sd: z.number().min(0),
    min: z.number().optional(),
    max: z.number().optional(),
    missingProbability: probabilitySchema.optional(),
  })
  .superRefine(requireOrderedBounds);

// mean/sd are in natural units (the generator converts to log-space
// parameters); lognormal support is positive, so the mean and any bounds
// must be too.
const numberLognormalSchema = z
  .strictObject({
    distribution: z.literal('lognormal'),
    mean: z.number().positive(),
    sd: z.number().min(0),
    min: z.number().min(0).optional(),
    max: z.number().positive().optional(),
    missingProbability: probabilitySchema.optional(),
  })
  .superRefine(requireOrderedBounds);

export const NumberSyntheticSchema = z.union([
  z.discriminatedUnion('distribution', [
    numberConstantSchema,
    numberUniformSchema,
    numberNormalSchema,
    numberLognormalSchema,
  ]),
  missingOnlySchema,
]);
export type NumberSynthetic = z.infer<typeof NumberSyntheticSchema>;

const scalarConstantSchema = z.strictObject({
  distribution: z.literal('constant'),
  value: probabilitySchema,
  missingProbability: probabilitySchema.optional(),
});

const scalarUniformSchema = z
  .strictObject({
    distribution: z.literal('uniform'),
    min: probabilitySchema.optional(),
    max: probabilitySchema.optional(),
    missingProbability: probabilitySchema.optional(),
  })
  .superRefine(requireOrderedBounds);

const scalarNormalSchema = z.strictObject({
  distribution: z.literal('normal'),
  mean: probabilitySchema,
  sd: z.number().min(0),
  missingProbability: probabilitySchema.optional(),
});

// A beta distribution's variance is bounded by mean·(1−mean); parameters at
// or past that bound have no alpha/beta solution, so they are rejected here
// rather than silently clamped at generation time.
const scalarBetaSchema = z
  .strictObject({
    distribution: z.literal('beta'),
    mean: z.number().gt(0).lt(1),
    sd: z.number().min(0),
    missingProbability: probabilitySchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.sd * value.sd >= value.mean * (1 - value.mean)) {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'A beta distribution requires sd² < mean × (1 − mean)',
        path: ['sd'],
      });
    }
  });

export const ScalarSyntheticSchema = z.union([
  z.discriminatedUnion('distribution', [
    scalarConstantSchema,
    scalarUniformSchema,
    scalarNormalSchema,
    scalarBetaSchema,
  ]),
  missingOnlySchema,
]);
export type ScalarSynthetic = z.infer<typeof ScalarSyntheticSchema>;

export const BooleanSyntheticSchema = z
  .strictObject({
    probabilityTrue: probabilitySchema.optional(),
    missingProbability: probabilitySchema.optional(),
  })
  .superRefine(requireSomeField);
export type BooleanSynthetic = z.infer<typeof BooleanSyntheticSchema>;

/**
 * Typed identity key for an option value. Weight entries and selection logic
 * must distinguish the number 1 from the string "1" — existing codebooks can
 * carry both — so every comparison goes through this key.
 */
export const optionValueKey = (value: number | string): string =>
  `${typeof value}:${String(value)}`;

const optionWeightSchema = z.strictObject({
  value: z.union([z.number().int(), z.string()]),
  weight: z.number().min(0),
});
export type SyntheticOptionWeight = z.infer<typeof optionWeightSchema>;

const optionWeightsSchema = z
  .array(optionWeightSchema)
  .min(1)
  .superRefine((weights, ctx) => {
    const seen = new Set<string>();
    weights.forEach((entry, index) => {
      const key = optionValueKey(entry.value);
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `Duplicate option weight for value ${JSON.stringify(entry.value)}`,
          path: [index, 'value'],
        });
      }
      seen.add(key);
    });
  });

export const OrdinalSyntheticSchema = z
  .strictObject({
    optionWeights: optionWeightsSchema.optional(),
    missingProbability: probabilitySchema.optional(),
  })
  .superRefine(requireSomeField);
export type OrdinalSynthetic = z.infer<typeof OrdinalSyntheticSchema>;

const selectionCountEntrySchema = z.strictObject({
  count: nonNegativeInt,
  probability: probabilitySchema,
});

const selectionCountSchema = z
  .strictObject({
    probabilities: z.array(selectionCountEntrySchema).min(1),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<number>();
    value.probabilities.forEach((entry, index) => {
      if (seen.has(entry.count)) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `Duplicate selection count ${entry.count}`,
          path: ['probabilities', index, 'count'],
        });
      }
      seen.add(entry.count);
    });
    const sum = value.probabilities.reduce(
      (total, entry) => total + entry.probability,
      0,
    );
    if (Math.abs(sum - 1) > SELECTION_COUNT_PROBABILITY_TOLERANCE) {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'Selection-count probabilities must sum to 1',
        path: ['probabilities'],
      });
    }
  });
export type SyntheticSelectionCount = z.infer<typeof selectionCountSchema>;

export const CategoricalSyntheticSchema = z
  .strictObject({
    selectionCount: selectionCountSchema.optional(),
    optionWeights: optionWeightsSchema.optional(),
    missingProbability: probabilitySchema.optional(),
  })
  .superRefine(requireSomeField);
export type CategoricalSynthetic = z.infer<typeof CategoricalSyntheticSchema>;

// Date strings are validated against the variable's own resolution and
// effective window in variable.ts, where that context exists.
const datetimeUniformSchema = z.strictObject({
  distribution: z.literal('uniform'),
  min: z.string().optional(),
  max: z.string().optional(),
  missingProbability: probabilitySchema.optional(),
});

const datetimeNormalSchema = z.strictObject({
  distribution: z.literal('normal'),
  mean: z.string(),
  sdDays: z.number().min(0),
  min: z.string().optional(),
  max: z.string().optional(),
  missingProbability: probabilitySchema.optional(),
});

export const DatetimeSyntheticSchema = z.union([
  z.discriminatedUnion('distribution', [
    datetimeUniformSchema,
    datetimeNormalSchema,
  ]),
  missingOnlySchema,
]);
export type DatetimeSynthetic = z.infer<typeof DatetimeSyntheticSchema>;

export const SYNTHETIC_TEXT_GENERATORS = [
  // The generator an undeclared variable falls back to, and authorable in its
  // own right: without it, choosing neutral words for a variable whose name
  // looks like a person's would have to be stored as "nothing declared", which
  // resolution reads back as the inferred `personName` — so the choice could
  // be made in the editor but never saved.
  'neutralWords',
  'personName',
  'firstName',
  'lastName',
  'placeName',
  'organisationName',
  'occupation',
  'email',
  'phoneNumber',
  'streetAddress',
  'sentence',
  'paragraph',
] as const;
export type SyntheticTextGenerator = (typeof SYNTHETIC_TEXT_GENERATORS)[number];

export const TextSyntheticSchema = z
  .strictObject({
    generator: z.enum(SYNTHETIC_TEXT_GENERATORS).optional(),
    missingProbability: probabilitySchema.optional(),
  })
  .superRefine(requireSomeField);
export type TextSynthetic = z.infer<typeof TextSyntheticSchema>;

export type VariableSynthetic =
  | NumberSynthetic
  | ScalarSynthetic
  | BooleanSynthetic
  | OrdinalSynthetic
  | CategoricalSynthetic
  | DatetimeSynthetic
  | TextSynthetic;
