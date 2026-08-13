import { z } from 'zod';

/**
 * Optional synthetic-data generation metadata (`synthetic`), carried by
 * codebook variable definitions and by the stages that create entities.
 * Purely descriptive: it shapes what generated sample data looks like and
 * never affects how an interview collects real data. Everything here is
 * additive — a protocol that omits it is unchanged, and generation resolves
 * documented defaults instead.
 *
 * WHERE each half lives, and why they differ:
 *
 * - Variable shapes hang off the codebook variable, because a value
 *   distribution is a property of the thing being measured. Wherever `age` is
 *   collected, it is the same `age`.
 * - Count and topology shapes hang off the STAGE, because how many people get
 *   named — and how densely they get linked — is a property of the asking.
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

/**
 * A zero-deviation normal has the single-point support a constant has, so its
 * mean must be a value the draw can actually return: inside its own truncation
 * window, and inside the domain the metric itself lives on.
 *
 * Clamped otherwise, exactly as the variable-level number and datetime rules
 * describe — a density of `{ mean: 0.2, sd: 0, min: 0.8, max: 0.9 }` returns
 * 0.8 every time, and a negative mean-degree mean returns 0, in both cases
 * replacing the authored distribution in silence.
 */
const requireReachableDegenerateMean =
  (domain: { min: number; max?: number }) =>
  (
    value: { mean: number; sd: number; min?: number; max?: number },
    ctx: z.RefinementCtx,
  ) => {
    if (value.sd !== 0) return;
    const lower = Math.max(value.min ?? Number.NEGATIVE_INFINITY, domain.min);
    const upper = Math.min(
      value.max ?? Number.POSITIVE_INFINITY,
      domain.max ?? Number.POSITIVE_INFINITY,
    );
    if (value.mean < lower || value.mean > upper) {
      ctx.addIssue({
        code: 'custom' as const,
        message: `A mean of ${value.mean} lies outside the values this distribution can return, and a standard deviation of 0 can reach nothing else`,
        path: ['mean'],
      });
    }
  };

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
// Stage level: node population counts
// ---------------------------------------------------------------------------

/**
 * The most people one stage may be asked to produce.
 *
 * A synthetic population is generated SYNCHRONOUSLY — Architect's PreviewHost
 * calls `generateNetwork` on the main thread, and the planner iterates once per
 * node and once per pair. A count of a billion is arithmetically fine and
 * schema-valid, and it locks the renderer. Ten thousand is far past any
 * plausible interview and still returns.
 */
export const MAX_SYNTHETIC_POPULATION = 10_000;

/**
 * The most unordered PAIRS a preview may enumerate for one edge-creating
 * stage.
 *
 * A population bound alone is not enough, because pairs grow quadratically:
 * the schema-valid 10,000 people admitted here reach 49,995,000 pairs, and the
 * planner materialises that domain as map entries before it selects any
 * topology from it. Generation is synchronous on Architect's main thread, so
 * that exhausts memory rather than merely taking a while.
 *
 * Bounded separately from the population because it constrains a different
 * thing: a node type no stage links may hold ten thousand people quite
 * happily. 250,000 pairs is roughly 707 people in one linkable set — far past
 * any interview a participant could sit through.
 */
export const MAX_SYNTHETIC_PAIRS = 250_000;

const nonNegativeInt = z.number().int().min(0);
const populationInt = nonNegativeInt.max(MAX_SYNTHETIC_POPULATION);

/**
 * The most entities a count can ask for, which is what has to be bounded — not
 * its parameters one at a time.
 *
 * The generator draws within six deviations of a mean and plans once per
 * entity and once per PAIR, so `{ mean: 10_000, sd: 10_000 }` reaches 70,000
 * people and 2.45 billion pairs while every individual parameter looks
 * reasonable. Defined here, beside the schema that admits the count, and
 * re-exported to the generator so the bound and the draw cannot drift apart.
 */
export function syntheticCountCeiling(count: {
  distribution: string;
  value?: number;
  mean?: number;
  sd?: number;
  min?: number;
  max?: number;
}): number {
  switch (count.distribution) {
    case 'constant':
      return count.value ?? 0;
    case 'uniform':
      return count.max ?? 0;
    case 'poisson':
      return (
        count.max ??
        Math.max(
          count.min ?? 0,
          Math.ceil((count.mean ?? 0) + 6 * Math.sqrt(count.mean ?? 0) + 1),
        )
      );
    case 'normal':
      return (
        count.max ??
        Math.max(
          count.min ?? 0,
          0,
          Math.ceil((count.mean ?? 0) + 6 * (count.sd ?? 0)),
        )
      );
    default:
      return 0;
  }
}

const rejectOversizedPopulation = (
  count: {
    distribution: string;
    mean?: number;
    sd?: number;
    min?: number;
    max?: number;
  },
  ctx: z.RefinementCtx,
) => {
  const ceiling = syntheticCountCeiling(count);
  if (ceiling > MAX_SYNTHETIC_POPULATION) {
    ctx.addIssue({
      code: 'custom' as const,
      message: `This count can reach ${ceiling} entities; generation is synchronous, so it is capped at ${MAX_SYNTHETIC_POPULATION}`,
      path: [],
    });
  }
};

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
    mean: z.number().min(0),
    min: populationInt.optional(),
    max: populationInt.optional(),
  })
  .superRefine(requireOrderedBounds)
  .superRefine(rejectOversizedPopulation)
  // A Poisson mean of 0 has the single-point support a zero-deviation normal
  // has — every draw is 0 — so its sole value is held to the window the same
  // way: with a floor above 0 the draw is clamped to the floor every time and
  // the authored "always zero" is discarded in silence.
  .superRefine((value, ctx) => {
    if (value.mean === 0 && (value.min ?? 0) > 0) {
      ctx.addIssue({
        code: 'custom' as const,
        message:
          'A mean of 0 lies outside the values this distribution can return, and a Poisson with a mean of 0 can reach nothing else',
        path: ['mean'],
      });
    }
  });

// A negative mean stays representable: truncation and rounding keep drawn
// counts non-negative integers, so "usually zero, occasionally more" is a
// legitimate parameterisation.
const normalCountSchema = z
  .strictObject({
    distribution: z.literal('normal'),
    mean: z.number(),
    sd: z.number().min(0),
    min: populationInt.optional(),
    max: populationInt.optional(),
  })
  .superRefine(requireOrderedBounds)
  .superRefine(rejectOversizedPopulation)
  // A negative mean is legitimate WITH spread — "usually zero, occasionally
  // more" — but with none there is no occasionally: the sole draw is clamped
  // to the window and the authored mean is discarded, exactly as it is for a
  // topology or a variable descriptor.
  .superRefine(requireReachableDegenerateMean({ min: 0 }));

export const SyntheticCountSchema = z.discriminatedUnion('distribution', [
  constantCountSchema,
  uniformCountSchema,
  poissonCountSchema,
  normalCountSchema,
]);
export type SyntheticCount = z.infer<typeof SyntheticCountSchema>;

/**
 * What a node-creating stage declares: how many people it produces.
 *
 * This lives on the STAGE rather than the node type because a count is a
 * property of the asking, not of the asked-about. Three name generators over
 * `Person` each nominate their own people; a single population declared on the
 * type would have to be apportioned between them, and nothing in the protocol
 * says how. Declared per stage, each stage's demand is independent, a type no
 * stage creates simply has no people, and a roster stage that asks for more
 * rows than its pool holds is a local, reportable error.
 */
export type StageNodeSynthetic = { count: SyntheticCount };

// Annotated rather than inferred. These shapes land in EIGHT stage schemas and
// so in the `Stage` union every consumer resolves, and left to inference each
// one expands its whole distribution union inline — enough for TypeScript to
// refuse to serialize the declarations of anything mapping over stages
// (TS7056). Naming the type keeps the union referring to an alias instead.
export const StageNodeSyntheticSchema: z.ZodType<StageNodeSynthetic> =
  z.strictObject({
    count: SyntheticCountSchema,
  });

// ---------------------------------------------------------------------------
// Stage level: edge topology
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
  .superRefine(requireOrderedBounds)
  .superRefine(requireReachableDegenerateMean({ min: 0, max: 1 }));

// Density is a proportion, so beta is its natural family: it lives on 0–1 by
// construction rather than by clamping a normal that wanted to leave. Its
// variance is bounded by mean·(1−mean) — parameters at or past that bound have
// no alpha/beta solution, so they are rejected here rather than silently
// clamped at generation time (the same rule scalar variables carry).
const densityBetaSchema = z
  .strictObject({
    distribution: z.literal('beta'),
    mean: z.number().gt(0).lt(1),
    sd: z.number().min(0),
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

const densityDistributionSchema = z.discriminatedUnion('distribution', [
  densityConstantSchema,
  densityUniformSchema,
  densityNormalSchema,
  densityBetaSchema,
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
  .superRefine(requireOrderedBounds)
  .superRefine(requireReachableDegenerateMean({ min: 0 }));

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

/**
 * What an edge-creating stage declares: how densely it links the people it can
 * see. Density is resolved against the pairs eligible AT THAT STAGE — its
 * subject type, its filter, and the nodes that exist by the time it runs — so
 * unlike a whole-network target it is well defined during the interview walk.
 *
 * A stage whose prompts create more than one edge type applies the same
 * topology to each, independently, over that type's own eligible pairs.
 */
export type StageEdgeSynthetic = { topology: EdgeTopology };

export const StageEdgeSyntheticSchema: z.ZodType<StageEdgeSynthetic> =
  z.strictObject({
    topology: EdgeTopologySchema,
  });

/**
 * What a stage that creates BOTH people and links declares. Either half may
 * stand alone, but an empty block says nothing that "no block at all" does not
 * already say, so it is rejected rather than stored.
 */
export type StageNodeAndEdgeSynthetic = {
  count?: SyntheticCount;
  topology?: EdgeTopology;
};

export const StageNodeAndEdgeSyntheticSchema: z.ZodType<StageNodeAndEdgeSynthetic> =
  z
    .strictObject({
      count: SyntheticCountSchema.optional(),
      topology: EdgeTopologySchema.optional(),
    })
    .superRefine(requireSomeField);

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
