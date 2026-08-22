import z from 'zod';

// --------------------------------
// CONSTANTS
// --------------------------------

/**
 * The most people one stage may be asked to produce.
 */
export const MAX_SYNTHETIC_POPULATION = 100;

/**
 * The most unordered PAIRS a preview may enumerate for one edge-creating
 * stage.
 */
export const MAX_SYNTHETIC_PAIRS = Math.floor(
  (MAX_SYNTHETIC_POPULATION * (MAX_SYNTHETIC_POPULATION - 1)) / 2,
); // Based on the formula for the number of unique pairs in a set of n items: n * (n - 1) / 2

// --------------------------------
// HELPERS
// --------------------------------

/**
 * Typed identity key for an option value. Weight entries and selection logic
 * must distinguish the number 1 from the string "1" — existing codebooks can
 * carry both — so every comparison goes through this key.
 *
 * The type prefix is what the refusals rest on, not decoration: an option
 * weight naming `'1'` where the variable offers the integer `1` names a value
 * the variable does not have, and `rejectInvalidOptionWeights` says so
 * (`synthetic.test.ts`, "the string \"1\" is not the integer option value 1").
 * Keying on `String(value)` alone would silently accept it and then weight
 * nothing.
 *
 * Accepts a boolean as well as the two types an OPTION value may take, because
 * an editor keys the same table with the same rule and reads its options off a
 * codebook entry mid-edit, where a boolean variable's own option list is one of
 * the things it may be looking at. Widening the parameter keeps that editor on
 * this one implementation rather than on a second spelling of the prefix.
 */
export const optionValueKey = (value: number | string | boolean): string =>
  `${typeof value}:${String(value)}`;

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

/**
 * Helper to enforce logic that is common to all count  distributions: a stage that asks for more than it can possibly create is a misconfiguration, and a stage that asks for less than 0 is nonsensical.
 */
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

/**
 * Reject a synthetic block that declares nothing. A stage that creates neither
 * people nor links is a no-op, and a variable that declares neither a value
 * distribution nor a missing probability is indistinguishable from one that
 * declares nothing at all.
 */
export const requireSomeField = (
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

// --------------------------------
// BASIC SCHEMAS
// --------------------------------

const nonNegative = z.number().nonnegative();
const nonNegativeInt = z.number().int().nonnegative();

// A schema for validating probability values between 0 and 1.
export const probabilitySchema = z.number().min(0).max(1);

// Schema for any valid population number below the max allowed constant.
const populationInt = z.number().int().min(0).max(MAX_SYNTHETIC_POPULATION);

// Missingness may be declared without a value distribution on any supported
// variable type, so union-shaped types carry this extra branch.
export const missingOnlySchema = z.strictObject({
  missingProbability: probabilitySchema,
});

// --------------------------------
// DISTRIBUTION VALIDATORS
// --------------------------------

/**
 * Constant count - a stage that always produces the same number of people.
 */
export const constantCountSchema = z.strictObject({
  distribution: z.literal('constant'),
  value: populationInt,
});

/**
 * Uniform count - a stage that produces a number of people uniformly distributed
 * between min and max.
 */
export const uniformCountSchema = z
  .strictObject({
    distribution: z.literal('uniform'),
    min: populationInt,
    max: populationInt,
  })
  .superRefine(requireOrderedBounds);

/**
 * Poisson count - a stage that produces a number of people following a Poisson distribution, which is often used to model the number of events occurring within a fixed interval of time or space.
 */
export const poissonCountSchema = z
  .strictObject({
    distribution: z.literal('poisson'),
    // A mean is a population figure, so it lives in the same domain the counts
    // themselves do. Left unbounded, `poisson mean 2_000_000` validated and
    // then drew a clamped 100 every time — an authored distribution silently
    // replaced by a constant.
    mean: z.number().min(0).max(MAX_SYNTHETIC_POPULATION),
    min: populationInt.optional(),
    max: populationInt.optional(),
  })
  .superRefine(requireOrderedBounds)
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

/**
 * Normal count - a stage that produces a number of people following a normal distribution, which is often used to model natural phenomena.
 */
export const normalCountSchema = z
  .strictObject({
    distribution: z.literal('normal'),
    // Bounded above for the reason the Poisson mean is (see above). Still
    // unbounded BELOW, because a negative mean with spread is a legitimate
    // "usually none, occasionally a few".
    mean: z.number().max(MAX_SYNTHETIC_POPULATION),
    sd: z.number().min(0),
    min: populationInt.optional(),
    max: populationInt.optional(),
  })
  .superRefine(requireOrderedBounds)
  // A negative mean is legitimate WITH spread — "usually zero, occasionally
  // more" — but with none there is no occasionally: the sole draw is clamped
  // to the window and the authored mean is discarded, exactly as it is for a
  // topology or a variable descriptor.
  .superRefine(requireReachableDegenerateMean({ min: 0 }));

/**
 * Constant density - a stage that always produces the same density of edges.
 */
export const densityConstantSchema = z.strictObject({
  distribution: z.literal('constant'),
  value: probabilitySchema,
});

/**
 * Uniform density - a stage that produces a density of edges uniformly distributed between min and max.
 */
export const densityUniformSchema = z
  .strictObject({
    distribution: z.literal('uniform'),
    min: probabilitySchema.optional(),
    max: probabilitySchema.optional(),
  })
  .superRefine(requireOrderedBounds);

/**
 * Normal density - a stage that produces a density of edges following a normal distribution.
 */
export const densityNormalSchema = z
  .strictObject({
    distribution: z.literal('normal'),
    mean: probabilitySchema,
    sd: z.number().min(0),
    min: probabilitySchema.optional(),
    max: probabilitySchema.optional(),
  })
  .superRefine(requireOrderedBounds)
  .superRefine(requireReachableDegenerateMean({ min: 0, max: 1 }));

/**
 * Density Beta - A beta distribution is a continuous probability distribution defined on the
 * interval [0, 1], often used to model random variables that represent proportions or
 * probabilities. The beta distribution is parameterized by two shape parameters, alpha (α) and
 * beta (β), which determine the shape of the distribution. The mean and standard deviation of a
 * beta distribution can be derived from these parameters, and they must satisfy certain conditions
 * to ensure that the distribution is valid.
 */
export const densityBetaSchema = z
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

/**
 * Mean degree constant - a stage that always produces the same mean degree of edges.
 */
export const meanDegreeConstantSchema = z.strictObject({
  distribution: z.literal('constant'),
  value: nonNegative,
});

/**
 * Mean degree uniform - a stage that produces a mean degree of edges uniformly distributed between min and max.
 */
export const meanDegreeUniformSchema = z
  .strictObject({
    distribution: z.literal('uniform'),
    min: nonNegative,
    max: nonNegative,
  })
  .superRefine(requireOrderedBounds);

/**
 * Mean degree normal - a stage that produces a mean degree of edges following a normal distribution.
 */
export const meanDegreeNormalSchema = z
  .strictObject({
    distribution: z.literal('normal'),
    mean: z.number(),
    sd: z.number().min(0),
    min: nonNegative.optional(),
    max: nonNegative.optional(),
  })
  .superRefine(requireOrderedBounds)
  .superRefine(requireReachableDegenerateMean({ min: 0 }));

/**
 * Number constant - a variable that always produces the same number, with a probability of being missing.
 */
export const numberConstantSchema = z.strictObject({
  distribution: z.literal('constant'),
  value: z.number(),
  missingProbability: probabilitySchema.optional(),
});

/**
 * Number uniform - a variable that produces a number uniformly distributed between min and max, with a probability of being missing.
 */
export const numberUniformSchema = z
  .strictObject({
    distribution: z.literal('uniform'),
    min: z.number(),
    max: z.number(),
    missingProbability: probabilitySchema.optional(),
  })
  .superRefine(requireOrderedBounds);

/**
 * Number normal - a variable that produces a number following a normal distribution, with a probability of being missing.
 */
export const numberNormalSchema = z
  .strictObject({
    distribution: z.literal('normal'),
    mean: z.number(),
    sd: z.number().min(0),
    min: z.number().optional(),
    max: z.number().optional(),
    missingProbability: probabilitySchema.optional(),
  })
  .superRefine(requireOrderedBounds);

/**
 * Number lognormal - a variable that produces a number following a lognormal distribution, with a probability of being missing.
 */
export const numberLognormalSchema = z
  .strictObject({
    distribution: z.literal('lognormal'),
    mean: z.number().positive(),
    sd: z.number().min(0),
    min: z.number().min(0).optional(),
    max: z.number().positive().optional(),
    missingProbability: probabilitySchema.optional(),
  })
  .superRefine(requireOrderedBounds);

/**
 * Scalar constant - a variable that always produces the same scalar value, with a probability of being missing.
 */
export const scalarConstantSchema = z.strictObject({
  distribution: z.literal('constant'),
  value: probabilitySchema,
  missingProbability: probabilitySchema.optional(),
});

/**
 * Scalar uniform - a variable that produces a scalar value uniformly distributed between min and max, with a probability of being missing.
 */
export const scalarUniformSchema = z
  .strictObject({
    distribution: z.literal('uniform'),
    min: probabilitySchema.optional(),
    max: probabilitySchema.optional(),
    missingProbability: probabilitySchema.optional(),
  })
  .superRefine(requireOrderedBounds);

/**
 * Scalar normal - a variable that produces a scalar value following a normal distribution, with a probability of being missing.
 */
export const scalarNormalSchema = z.strictObject({
  distribution: z.literal('normal'),
  mean: probabilitySchema,
  sd: z.number().min(0),
  missingProbability: probabilitySchema.optional(),
});

/**
 * Scalar beta - a variable that produces a scalar value following a beta distribution, with a probability of being missing.
 */
export const scalarBetaSchema = z
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

/**
 * Selection count entry - a single entry in a selection count distribution, which specifies the count and its associated probability.
 */
export const selectionCountEntrySchema = z.strictObject({
  count: nonNegativeInt,
  probability: probabilitySchema,
});

/**
 * A datetime window expressed as an offset from a date, in days — the same
 * vocabulary `relativeDatePickerParametersSchema` already uses, and for the
 * same reason: an absent `anchor` means the date the session runs on.
 *
 * The relative form exists because the window a datetime falls back to is a
 * reach back from the session date, and neither a parse nor Architect knows
 * that date. Written absolutely at authoring time it would FREEZE — a protocol
 * authored in 2026 and run in 2028 would generate two-year-stale dates — so the
 * descriptor names the offset and the generator, which holds the session date
 * already, resolves it.
 *
 * `before` and `after` are independent non-negative offsets in opposite
 * directions (earliest = anchor − before, latest = anchor + after), exactly as
 * a RelativeDatePicker's own parameters are, so there is no `before < after`
 * relationship to enforce. The anchor is held to a real ISO date by
 * `rejectInvalidDatetimeSynthetic`, which owns the one implementation of that
 * check.
 */
const relativeDateWindowSchema = z.strictObject({
  anchor: z.string().optional(),
  before: nonNegativeInt,
  after: nonNegativeInt,
});

/**
 * Date time uniform - a variable that produces a datetime value uniformly distributed between min and max, with a probability of being missing.
 */
export const datetimeUniformSchema = z.strictObject({
  distribution: z.literal('uniform'),
  // A plain string here, and a real date by the time the variable parses:
  // `rejectInvalidDatetimeSynthetic` owns the one implementation of that
  // check, because what counts as a date depends on the picker's RESOLUTION
  // (a year picker's window is `2020`, a month picker's `2020-06`) — which is
  // a sibling field this schema cannot see. Narrowing it here would either
  // refuse a valid coarse window or duplicate the resolution table.
  min: z.string().optional(),
  max: z.string().optional(),
  relative: relativeDateWindowSchema.optional(),
  missingProbability: probabilitySchema.optional(),
});

/**
 * Date time normal - a variable that produces a datetime value following a normal distribution, with a probability of being missing.
 */
export const datetimeNormalSchema = z.strictObject({
  distribution: z.literal('normal'),
  mean: z.string(),
  sdDays: z.number().min(0),
  min: z.string().optional(),
  max: z.string().optional(),
  relative: relativeDateWindowSchema.optional(),
  missingProbability: probabilitySchema.optional(),
});
