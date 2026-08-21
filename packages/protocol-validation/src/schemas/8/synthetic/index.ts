import { z } from 'zod';

import {
  constantCountSchema,
  datetimeNormalSchema,
  datetimeUniformSchema,
  densityBetaSchema,
  densityConstantSchema,
  densityNormalSchema,
  densityUniformSchema,
  meanDegreeConstantSchema,
  meanDegreeNormalSchema,
  meanDegreeUniformSchema,
  missingOnlySchema,
  normalCountSchema,
  numberConstantSchema,
  numberLognormalSchema,
  numberNormalSchema,
  numberUniformSchema,
  optionValueKey,
  poissonCountSchema,
  probabilitySchema,
  MAX_SYNTHETIC_POPULATION,
  requireSomeField,
  scalarBetaSchema,
  scalarConstantSchema,
  scalarNormalSchema,
  scalarUniformSchema,
  selectionCountEntrySchema,
  uniformCountSchema,
} from '../../../shared/synthetic/helpers.ts';

// The schema-owned resolvers and calibration constants an engine reads but
// never re-derives. Re-exported here so `synthetic/index.ts` remains the one
// module a consumer of generation parameters has to reach for.
export * from './clock.ts';
export * from './topology.ts';

/**
 * Optional synthetic-data generation metadata (`synthetic`), carried by
 * codebook variable definitions and by the stages that create entities.
 * It shapes what generated sample data looks like and
 * never affects how an interview collects real data. Everything here is
 * additive — a protocol that omits it is unchanged, and generation resolves
 * documented defaults instead.
 *
 * - Variable shapes hang off the codebook variable, because a value
 *   distribution is a property of the thing being measured. Wherever `age` is
 *   collected, it is the same `age`.
 * - Count and topology shapes hang off the STAGE, because how many people get
 *   named — and how densely they get linked — is a property of the asking.
 *
 */

// ---------------------------------------------------------------------------
// Stage level: what a stage costs the participant
// ---------------------------------------------------------------------------

/**
 * What each stage type asks of the participant, in the units dropout
 * accumulates. A first approximation from domain knowledge rather than from
 * measurement — which is precisely why the field is authorable: a researcher
 * who has run their own instrument knows better than this table does.
 *
 * Deliberately NOT annotated `Record<StageType, number>` here. `StageType` is
 * derived from the stage union, and every stage schema imports this module, so
 * naming it here would close an import cycle. `stages/index.ts` asserts the
 * table's completeness at the type level instead, where `StageType` exists —
 * so a stage type added without a burden still fails the typecheck rather than
 * resolving to `undefined` on the first interview generated against it.
 */
export const DEFAULT_RESPONSE_BURDEN = {
  AlterEdgeForm: 0.3,
  AlterForm: 0.3,
  Anonymisation: 0.1,
  CategoricalBin: 0.5,
  DyadCensus: 1.0,
  EgoForm: 0.4,
  FamilyPedigree: 1,
  Geospatial: 0.7,
  Information: 0,
  NameGenerator: 0.3,
  NameGeneratorQuickAdd: 0.2,
  NameGeneratorRoster: 0.4,
  Narrative: 0.0,
  NarrativePedigree: 0.2,
  NetworkComposer: 0, // No burden, because operated by researcher
  OneToManyDyadCensus: 0.5,
  OrdinalBin: 0.5,
  Sociogram: 0.6,
  TieStrengthCensus: 1,
};

/**
 * The stage types `DEFAULT_RESPONSE_BURDEN` prices. Structurally identical to
 * `StageType`, and held to it by the assertion in `stages/index.ts`; named
 * separately only because this module cannot import that one.
 */
export type BurdenedStageType = keyof typeof DEFAULT_RESPONSE_BURDEN;

/**
 * How sharply accumulated response burden translates into the risk of a
 * participant abandoning the interview.
 *
 * Burden is a rate, not a probability: it accumulates without bound as the
 * interview goes on, so it is mapped onto a per-stage hazard through
 * `1 - exp(-rate * burden)`. That keeps dropout risk monotonically increasing
 * with fatigue while never reaching certainty — a participant who has already
 * completed a long, demanding protocol is very likely to leave, but the model
 * never guarantees it.
 *
 * Because each stage's hazard is drawn independently, the chance of reaching
 * the end of a protocol is the product of every stage surviving its own roll,
 * which collapses to `exp(-rate * S)` where `S` is the sum of the cumulative
 * burden at each stage. Recalibrating is therefore arithmetic rather than
 * simulation: `rate = -ln(1 - targetDropout) / S`.
 *
 * This value is calibrated against the sample protocol — 30 stages carrying
 * 7.5 total burden, so `S` is 99.2 — to lose roughly one participant in ten.
 * Note that `S` grows quadratically with protocol length.
 */
export const DROPOUT_HAZARD_RATE = 0.0011;

/**
 * The one field EVERY stage descriptor carries, whatever the stage puts into
 * the network — which is why it lives on a shared base rather than on the
 * shapes that produce entities. A NarrativePedigree generates nothing and
 * still costs 0.2, because reading a narrative takes the participant's
 * attention whether or not it leaves a trace in the data.
 *
 * `nonnegative()` rather than `probabilitySchema`: burden is a RATE, not a
 * probability. It is summed across every stage completed so far and only then
 * mapped onto a per-stage hazard, through `1 - exp(-DROPOUT_HAZARD_RATE *
 * burden)`, so it accumulates without bound and an author must be able to say
 * that their sociogram costs 1.5 of the usual one. Capping it at 1 would make
 * the ceiling of the table the ceiling of the model.
 *
 * Resolved by a field-level `.default()`, which fires while the object parses
 * — so the value is in place before the protocol-level `superRefine` runs and
 * is validated by it, the same ordering `withResolvedSyntheticCount` relies on.
 *
 * That ordering is why every stage schema attaches these descriptors with
 * `.prefault({})` rather than `.default({})`. In Zod 4 an outer `.default()`
 * SHORT-CIRCUITS: when the key is absent it hands back the literal value it
 * was given, without parsing it, so no field-level default inside ever fires
 * and the stage would come out carrying `{}`. `.prefault()` substitutes and
 * then parses, which is the behaviour the whole arrangement depends on.
 */
const syntheticStageBase = (stageType: BurdenedStageType) =>
  z.strictObject({
    responseBurden: z
      .number()
      .nonnegative()
      .default(DEFAULT_RESPONSE_BURDEN[stageType]),
  });

// ---------------------------------------------------------------------------
// Stage level: what a stage produces
// ---------------------------------------------------------------------------

/**
 * Every stage carries a `synthetic` descriptor, so generation never has to
 * infer from a stage's TYPE whether it produces anything — the protocol says
 * so, and a stage that declares nothing is a stage that was never parsed.
 *
 * `generatesData` is the discriminant that makes the absence meaningful. A
 * scripted screen genuinely produces nothing, which is different from a stage
 * that produces something but declared no parameters for it; without the flag
 * those two are the same empty object.
 *
 * Defaulted on every stage schema, so an author writes it only to change it.
 *
 * A factory rather than a schema because the burden default differs per stage
 * type, and each stage schema is the only thing that knows which type it is.
 */
export const stageNoDataSynthetic = (stageType: BurdenedStageType) =>
  syntheticStageBase(stageType).extend({
    generatesData: z.literal(false),
  });
export type StageNoDataSynthetic = z.infer<
  ReturnType<typeof stageNoDataSynthetic>
>;

/** The descriptor of a stage that writes values but creates no entities. */
export const stageValuesSynthetic = (stageType: BurdenedStageType) =>
  syntheticStageBase(stageType).extend({
    generatesData: z.literal(true).default(true),
  });
export type StageValuesSynthetic = z.infer<
  ReturnType<typeof stageValuesSynthetic>
>;

// ---------------------------------------------------------------------------
// Stage level: node population counts
// ---------------------------------------------------------------------------

// Defined here rather than helpers so that future schema versions can add new distributions.
const SyntheticCountSchema = z.discriminatedUnion('distribution', [
  constantCountSchema,
  uniformCountSchema,
  poissonCountSchema,
  normalCountSchema,
]);

export type SyntheticCount = z.infer<typeof SyntheticCountSchema>;

/**
 * The nomination distribution a stage that declares no count is read as
 * having: a personal-network module's typical elicitation, with enough spread
 * that generated networks vary in size.
 *
 * Normal rather than Poisson so the spread is the author's to set. A Poisson
 * fixes its own variance at its mean (sd = √8 ≈ 2.83 here, close to this by
 * coincidence), which is the right model for an unbounded arrival process but
 * leaves no way to express a tighter or looser elicitation than the mean
 * implies.
 *
 * Shared so the name generators (which fit it to their own `behaviours`
 * window) and NetworkComposer (which has no such window) cannot drift apart on
 * what "unstated" means.
 */
export const DEFAULT_NOMINATION_MEAN = 8;
export const DEFAULT_NOMINATION_SD = 3;

export const DEFAULT_NODE_COUNT: SyntheticCount = {
  distribution: 'normal',
  mean: DEFAULT_NOMINATION_MEAN,
  sd: DEFAULT_NOMINATION_SD,
  min: 0,
  max: MAX_SYNTHETIC_POPULATION,
};

/**
 * What a node-creating stage declares: how many people it produces.
 */
export type StageNodeSynthetic = {
  generatesData: true;
  responseBurden: number;
  count: SyntheticCount;
};

// Annotated rather than inferred due to TS7056. Naming the type keeps the union referring to an alias instead.
export const stageNodeSynthetic = (
  stageType: BurdenedStageType,
): z.ZodType<
  StageNodeSynthetic,
  { generatesData?: true; responseBurden?: number; count: unknown }
> =>
  syntheticStageBase(stageType).extend({
    generatesData: z.literal(true).default(true),
    count: SyntheticCountSchema,
  });

// ---------------------------------------------------------------------------
// Stage level: edge topology
// ---------------------------------------------------------------------------

const densityDistributionSchema = z.discriminatedUnion('distribution', [
  densityConstantSchema,
  densityUniformSchema,
  densityNormalSchema,
  densityBetaSchema,
]);

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
 * The edge topology a stage that declares no topology is read as having.
 *
 * Mean degree rather than density, because it is the metric that survives a
 * change of roster size: real personal networks hold ties-per-person roughly
 * constant as the alter count grows, while density falls away quadratically —
 * a fixed default density that read as "recognisably connected" over eight
 * alters rendered fourteen as an unreadable web, since the pair count it is a
 * proportion of had quadrupled (maintainer decision, 2026-08-21). A mean of 3
 * links each person to about three others whatever the network's size, an sd
 * of 1 keeps run-to-run variation visible, and the realisation converts to a
 * whole edge count and clamps it to the pairs actually available, so small
 * networks stay valid without the declaration having to know their size.
 */
export const DEFAULT_EDGE_TOPOLOGY: EdgeTopology = {
  metric: 'meanDegree',
  distribution: { distribution: 'normal', mean: 3, sd: 1 },
};

/**
 * What an edge-creating stage declares: how densely it creates edges.
 */
export type StageEdgeSynthetic = {
  generatesData: true;
  responseBurden: number;
  topology: EdgeTopology;
};

export const stageEdgeSynthetic = (
  stageType: BurdenedStageType,
): z.ZodType<
  StageEdgeSynthetic,
  { generatesData?: true; responseBurden?: number; topology?: unknown }
> =>
  syntheticStageBase(stageType).extend({
    generatesData: z.literal(true).default(true),
    topology: EdgeTopologySchema.default(DEFAULT_EDGE_TOPOLOGY),
  });

/**
 * What a stage that creates BOTH nodes and edges declares.
 */
export type StageNodeAndEdgeSynthetic = {
  generatesData: true;
  responseBurden: number;
  count?: SyntheticCount;
  topology?: EdgeTopology;
};

export const stageNodeAndEdgeSynthetic = (
  stageType: BurdenedStageType,
): z.ZodType<
  StageNodeAndEdgeSynthetic,
  {
    generatesData?: true;
    responseBurden?: number;
    count?: unknown;
    topology?: unknown;
  }
> =>
  syntheticStageBase(stageType)
    .extend({
      generatesData: z.literal(true).default(true),
      count: SyntheticCountSchema.optional(),
      topology: EdgeTopologySchema.optional(),
    })
    // `generatesData` is present on every descriptor and says nothing about
    // what this stage builds, so the "declares nothing" check has to look past
    // it: a composer block with neither a count nor a topology says exactly
    // what no block says, and storing it would leave the editor's toggle with
    // two indistinguishable off states.
    .superRefine((synthetic, ctx) => {
      if (synthetic.count === undefined && synthetic.topology === undefined) {
        ctx.addIssue({
          code: 'custom' as const,
          message:
            'A synthetic block must declare a count, a topology, or both',
          path: [],
        });
      }
    });

// ---------------------------------------------------------------------------
// Panel level: who a participant takes back off an existing-network panel
// ---------------------------------------------------------------------------

/**
 * The chance a participant re-nominates a person an existing-network panel
 * puts in front of them.
 *
 * Fixed rather than drawn: unlike the roster share, this is a per-person
 * decision the panel invites once for each candidate, so the variation comes
 * from the number of candidates rather than from a per-stage mood.
 */
export const DEFAULT_PANEL_NOMINATION_PROBABILITY = 0.3;

/**
 * What an existing-network panel declares: how readily the participant takes
 * back the people it shows them.
 *
 * Per PANEL rather than per stage, because a panel IS a question — "people you
 * named earlier" and "people you said you were close to" invite the same
 * candidate at very different rates, and a stage carrying both has no single
 * answer to give. The author is the only one who knows which panel is which.
 *
 * A probability rather than a rate, because it is consulted once per candidate
 * as a straight coin weighted this way; there is nothing here for a value
 * above 1 to mean.
 */
export const PanelSyntheticSchema = z.strictObject({
  nominationProbability: probabilitySchema.default(
    DEFAULT_PANEL_NOMINATION_PROBABILITY,
  ),
});
export type PanelSynthetic = z.infer<typeof PanelSyntheticSchema>;

// ---------------------------------------------------------------------------
// Prompt level: how often a categorical bin's "other" bin is reached for
// ---------------------------------------------------------------------------

/**
 * The chance a participant drops an alter into a categorical bin prompt's
 * "other" bin, where the prompt offers one.
 *
 * Low, because "other" is by construction the residual an author expects few
 * alters to fall into — a category common enough to be frequent would have
 * been given a bin of its own.
 */
export const DEFAULT_CATEGORICAL_OTHER_BIN_PROBABILITY = 0.1;

/**
 * What a categorical bin prompt declares: how readily the participant reaches
 * past the bins on offer.
 *
 * Per PROMPT rather than per stage, because a prompt IS a question — one stage
 * may bin the same alters by ethnicity and then by how they met, and the
 * residual of one says nothing about the residual of the other. The author is
 * the only one who knows how well each of their category lists covers the
 * people their participants will name.
 *
 * A probability rather than a rate, because it is consulted once per alter as
 * a straight coin weighted this way; there is nothing here for a value above 1
 * to mean.
 *
 * Resolved onto a prompt that sets `otherVariable` and refused on one that
 * does not — a prompt with no other bin has nothing for this to decide. See
 * `categoricalBinPromptSchema`, which does both.
 */
export const CategoricalBinPromptSyntheticSchema = z.strictObject({
  otherBinProbability: probabilitySchema.default(
    DEFAULT_CATEGORICAL_OTHER_BIN_PROBABILITY,
  ),
});
export type CategoricalBinPromptSynthetic = z.infer<
  typeof CategoricalBinPromptSyntheticSchema
>;

// ---------------------------------------------------------------------------
// Variable level
// ---------------------------------------------------------------------------

/**
 * The relative weight an option value carries when a variable's
 * `optionWeights` table omits it.
 *
 * Weights are relative rather than probabilities, so a table that raises one
 * option does not have to restate the others — and a variable declaring no
 * table at all draws UNIFORMLY across its options, every one of them carrying
 * this same weight.
 *
 * Read by generation too, which needs it to DRAW. Defined here rather than
 * there because the schema needs it to decide whether a weights table zeroes
 * every option a variable offers, and the two must agree: a table this refuses
 * is one generation would have drawn nothing from.
 */
export const DEFAULT_OPTION_WEIGHT = 1;

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
 * The ceiling a single option weight may carry. Weights are RELATIVE, so no
 * realistic declaration needs more than this — and an unbounded weight is a
 * live defect, not head-room: two weights of 1e308 sum to Infinity, the
 * weighted draw's countdown never crosses zero, and every draw lands
 * deterministically on the last option. Bounding the input is what makes the
 * overflow unrepresentable rather than defended against.
 */
export const MAX_SYNTHETIC_OPTION_WEIGHT = 1_000_000;

const optionWeightSchema = z.strictObject({
  value: z.union([z.number().int(), z.string()]),
  weight: z.number().min(0).max(MAX_SYNTHETIC_OPTION_WEIGHT),
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

    // Check that the sum of probabilities is approximately 1, allowing for a small tolerance. 1e-6 (which is 0.000001) is a common choice for floating-point comparisons.
    if (Math.abs(sum - 1) > 1e-6) {
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
