import { z } from 'zod';

/**
 * The run-level family-pedigree options, validated.
 *
 * Run-level and deliberately NOT protocol-embedded: a family is a structure,
 * not a population. The protocol says what a pedigree stage collects; how many
 * children a family tends to have, and how often a focal person was adopted or
 * donor-conceived, are properties of the population being simulated, and belong
 * to whoever asked for the batch.
 *
 * Every field is optional. `resolveFamilyPedigreeGenerationOptions` fills the
 * rest from the bundled US reference profile, which is why nothing here carries
 * a default of its own: an option a caller omits is an option resolved where it
 * always was.
 */

const weightedCountSchema = z.strictObject({
  value: z.number().int().nonnegative(),
  weight: z.number().min(0),
});

const populationProfileSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  sources: z.array(z.string()),
  completedFamilySize: z.array(weightedCountSchema).min(1),
  femaleAtBirthProbability: z.number().min(0).max(1),
  childlessPartnerProbability: z.number().min(0).max(1),
  scenarios: z.strictObject({
    adoption: z.number().min(0).max(1),
    donorConception: z.number().min(0).max(1),
    surrogacy: z.number().min(0).max(1),
  }),
});

export const familyPedigreeOptionsSchema = z.strictObject({
  /** Reference population used for family size and scenario sampling. */
  population: populationProfileSchema.optional(),
  /** Population sampling by default; a named value forces a test scenario. */
  scenario: z
    .enum(['population', 'none', 'adoption', 'donorConception', 'surrogacy'])
    .optional(),
  /**
   * `visualization` plants inheritance-pattern-aware affected lineages;
   * `none` writes every nomination variable as unaffected.
   */
  diseaseMode: z.enum(['visualization', 'none']).optional(),
  /** Safety cap for optional collateral branches. Core kin may exceed it. */
  maxNodes: z.number().int().positive().optional(),
});

export type FamilyPedigreeOptions = z.infer<typeof familyPedigreeOptionsSchema>;
