import type {
  FamilyPedigreeGenerationOptions,
  FamilyPedigreePopulationProfile,
  ResolvedFamilyPedigreeGenerationOptions,
} from './types';

/**
 * A transparent US reference profile for synthetic preview data.
 *
 * Family-size weights reproduce the 2017-2019 NSFG distribution for women
 * aged 40-49 (16.9% zero, 17.6% one, 32.7% two, 22.6% three, 10.1% four or
 * more). The open-ended group is split conservatively between four and five.
 * Selecting the family containing a focal person is size-biased at draw time;
 * unconditioned draws are used for cousins and the focal adult's own children.
 *
 * The adoption probability is a rough cohort approximation: the 120,869 US
 * adoptions reported for 2019 are about 3% of a recent annual birth cohort.
 * Donor conception and surrogacy are deliberately conservative focal-person
 * approximations from CDC ART surveillance. These sources use different
 * denominators, so callers studying any of these populations should supply a
 * tailored profile. Forced modes remain available because population sampling
 * correctly makes the scenarios rare.
 */
export const US_FAMILY_PEDIGREE_POPULATION: FamilyPedigreePopulationProfile = {
  id: 'us-2015-2022',
  label: 'United States, recent cohorts',
  sources: [
    'https://www.cdc.gov/nchs/nsfg/key_statistics/b-keystat.htm',
    'https://www.childwelfare.gov/pubPDFs/adopted2010_19.pdf',
    'https://www.cdc.gov/art/php/surveillance/index.html',
    'https://stacks.cdc.gov/view/cdc/155088/cdc_155088_DS1.pdf',
    'https://pmc.ncbi.nlm.nih.gov/articles/PMC6711384/',
  ],
  completedFamilySize: [
    { value: 0, weight: 0.169 },
    { value: 1, weight: 0.176 },
    { value: 2, weight: 0.327 },
    { value: 3, weight: 0.226 },
    { value: 4, weight: 0.075 },
    { value: 5, weight: 0.026 },
  ],
  femaleAtBirthProbability: 0.488,
  childlessPartnerProbability: 0.55,
  scenarios: {
    adoption: 0.03,
    donorConception: 0.005,
    surrogacy: 0.001,
  },
};

/**
 * The optional-branch cap a run falls back to when the caller's options name
 * none. A run option rather than a generation parameter: it bounds how large
 * a preview family is allowed to grow (the sampled topology decides the
 * actual size), the way `MAX_SYNTHETIC_INTERVIEWS` bounds a batch. Carried
 * over from the deleted engine's `familyPedigreeNodeCount.max` display
 * budget.
 */
export const DEFAULT_FAMILY_PEDIGREE_MAX_NODES = 32;

export function resolveFamilyPedigreeGenerationOptions(
  options: FamilyPedigreeGenerationOptions | undefined,
  defaultMaxNodes: number,
): ResolvedFamilyPedigreeGenerationOptions {
  const requestedMaxNodes = options?.maxNodes ?? defaultMaxNodes;
  const maxNodes = Number.isFinite(requestedMaxNodes)
    ? Math.floor(requestedMaxNodes)
    : defaultMaxNodes;

  return {
    population: options?.population ?? US_FAMILY_PEDIGREE_POPULATION,
    scenario: options?.scenario ?? 'population',
    diseaseMode: options?.diseaseMode ?? 'visualization',
    // Seven is ego + two genetic parents + four genetic grandparents, the
    // smallest complete multi-generational pedigree this generator emits.
    maxNodes: Math.max(maxNodes, 7),
  };
}
