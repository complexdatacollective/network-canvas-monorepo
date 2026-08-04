/**
 * Population-level parameters for synthetic pedigree generation.
 *
 * These are US/Northern-European figures. They are a named parameter set
 * rather than baked-in constants precisely because a study in another setting
 * should be able to substitute its own without editing the generator.
 *
 * Sources are given per field. Where a figure is a lifetime-ever measure rather
 * than a per-birth one, that is stated: the two are not interchangeable and the
 * generator treats each as what it is.
 */

/** A random source. Mirrors the surface of the generator's `ValueGenerator`. */
export type Rng = {
  /** Inclusive on both bounds. */
  randomInt: (min: number, max: number) => number;
  randomFloat: (min: number, max: number) => number;
};

/**
 * Completed fertility: the number of children born to women aged 40–44.
 *
 * US 2022 (NCFMR/CPS FP-23-29): 0 → 19%, 1 → 19%, 2 → 32%, 3 → 20%, 4+ → 11%.
 * The 4+ tail is split across 4 and 5 because a pedigree needs an actual
 * sibship size, not a bucket. Mean ≈ 1.9.
 */
export const COMPLETED_FERTILITY: readonly number[] = [
  0.19, 0.19, 0.32, 0.2, 0.08, 0.03,
];

/**
 * Completed fertility one generation back — the cohort who finished
 * childbearing around 1990, which is when a present-day 35-year-old's parents
 * and aunts and uncles were having children. Mean ≈ 2.0.
 */
export const PARENTAL_FERTILITY: readonly number[] = [
  0.16, 0.17, 0.35, 0.2, 0.08, 0.04,
];

/**
 * Completed fertility two generations back — the cohort who finished
 * childbearing in the mid-1970s, which is when a present-day 35-year-old's
 * grandparents were having children. Mean ≈ 2.9.
 *
 * Using today's rate here is the single biggest source of implausibility in a
 * synthetic pedigree. Cousin counts scale with roughly the square of the
 * reproductive rate, so applying a 1.9 to generations that bore children when
 * it was near 3 produces a family visibly too small: it under-produces cousins
 * by about a third against the Swedish register figures.
 */
export const GRANDPARENTAL_FERTILITY: readonly number[] = [
  0.1, 0.1, 0.22, 0.22, 0.17, 0.12, 0.07,
];

export type PedigreeDemography = {
  /** P(number of children) for ego's own generation. Index = child count. */
  completedFertility: readonly number[];
  /** As above, for ego's parents' and aunts'/uncles' childbearing. */
  parentalFertility: readonly number[];
  /** As above, for ego's grandparents' childbearing. */
  grandparentalFertility: readonly number[];
  /** P(a birth is one of twins). CDC/NCHS 2023: 30.7 per 1,000 deliveries. */
  twinRate: number;
  /** P(a given adult of childbearing generation has a recorded partner. */
  partnershipRate: number;
  /**
   * P(a partnership shown on the pedigree has ended.
   * ~40% of US first marriages end in divorce (Pew).
   */
  partnershipEndedRate: number;
  /** P(ego has children of their own at the time of interview. */
  egoHasChildrenRate: number;
  /** P(a child is adopted). ~2.5% of US children under 18. */
  adoptionRate: number;
  /** P(a birth used a donated egg). CDC ART 2021: ≈ 1 in 373 births. */
  donorEggRate: number;
  /**
   * P(a birth used donated sperm.
   * NSFG 1995–2017 puts ~0.7% of US women 15–44 as having ever used donor
   * insemination. That is a lifetime-ever measure over women, not a share of
   * births, so it is an upper bound used here as an order of magnitude.
   */
  donorSpermRate: number;
  /**
   * P(a birth was carried by a gestational carrier).
   * CDC ART 2021: 4.4% of ART cycles, and ART is ≈ 2.6% of US births.
   */
  surrogacyRate: number;
  /** P(a person is recorded male at birth). */
  maleRate: number;
  /**
   * P(a person's recorded sex is neither female nor male — intersex, not
   * known, or withheld. Small, but non-zero: the pedigree models it and the
   * genetics engine must keep handling it.
   */
  sexNotRecordedRate: number;
};

export const DEFAULT_DEMOGRAPHY: PedigreeDemography = {
  completedFertility: COMPLETED_FERTILITY,
  parentalFertility: PARENTAL_FERTILITY,
  grandparentalFertility: GRANDPARENTAL_FERTILITY,
  twinRate: 0.031,
  partnershipRate: 0.75,
  partnershipEndedRate: 0.2,
  egoHasChildrenRate: 0.55,
  adoptionRate: 0.025,
  donorEggRate: 0.0027,
  donorSpermRate: 0.007,
  surrogacyRate: 0.0011,
  maleRate: 0.512,
  sexNotRecordedRate: 0.02,
};

/**
 * Rates raised so a single pedigree exercises every arrangement the interface
 * supports. At true population rates a 25-person pedigree contains a donor or
 * surrogacy arrangement under 5% of the time, so a faithfully-calibrated
 * generator would almost never reach that code — which is exactly the code most
 * likely to be wrong. See `PedigreeMode`.
 */
export const SHOWCASE_DEMOGRAPHY: PedigreeDemography = {
  ...DEFAULT_DEMOGRAPHY,
  partnershipRate: 0.85,
  egoHasChildrenRate: 1,
  adoptionRate: 0.08,
  donorEggRate: 0.08,
  donorSpermRate: 0.08,
  surrogacyRate: 0.06,
};

/**
 * `showcase` guarantees coverage of the unusual arrangements and is the right
 * default for one pedigree somebody is going to look at — a preview, a story,
 * an interface test. `populationRates` samples faithfully and is the right
 * choice for a corpus somebody is going to count: fifty sessions that each
 * contain an adoption, a donor conception and a surrogacy are not realistic.
 */
export type PedigreeMode = 'showcase' | 'populationRates';

export function demographyFor(mode: PedigreeMode): PedigreeDemography {
  return mode === 'showcase' ? SHOWCASE_DEMOGRAPHY : DEFAULT_DEMOGRAPHY;
}

function normalise(weights: readonly number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return total === 0 ? weights.map(() => 0) : weights.map((w) => w / total);
}

/** Draws an index from a weight vector. Weights need not sum to 1. */
export function sampleIndex(rng: Rng, weights: readonly number[]): number {
  const probabilities = normalise(weights);
  let roll = rng.randomFloat(0, 1);
  for (let index = 0; index < probabilities.length; index++) {
    roll -= probabilities[index]!;
    if (roll <= 0) return index;
  }
  return probabilities.length - 1;
}

export function chance(rng: Rng, probability: number): boolean {
  if (probability <= 0) return false;
  if (probability >= 1) return true;
  return rng.randomFloat(0, 1) < probability;
}

/**
 * Which cohort's fertility governs a given childbearing event. Whose children
 * are being drawn decides this, not whose sibship it becomes.
 */
export type FertilityCohort = 'ego' | 'parental' | 'grandparental';

export function fertilityFor(
  demography: PedigreeDemography,
  cohort: FertilityCohort,
): readonly number[] {
  if (cohort === 'grandparental') return demography.grandparentalFertility;
  if (cohort === 'parental') return demography.parentalFertility;
  return demography.completedFertility;
}

/**
 * How many children a couple had, given they are known to be parents.
 *
 * Zero-truncated: drawing from the raw distribution would make a fifth of the
 * people we have already established are somebody's parents childless, which is
 * a contradiction rather than a rare case.
 */
export function sampleSibshipOfKnownParent(
  rng: Rng,
  demography: PedigreeDemography,
  cohort: FertilityCohort = 'ego',
): number {
  const truncated = fertilityFor(demography, cohort).map((weight, count) =>
    count === 0 ? 0 : weight,
  );
  return sampleIndex(rng, truncated);
}

/**
 * How many children a couple had, where nothing is yet known about whether
 * they had any. Used for aunts and uncles, who may be childless.
 */
export function sampleSibshipUnconditioned(
  rng: Rng,
  demography: PedigreeDemography,
  cohort: FertilityCohort = 'ego',
): number {
  return sampleIndex(rng, fertilityFor(demography, cohort));
}

/**
 * The size of the sibship a known *child* belongs to.
 *
 * Size-biased: a randomly chosen child is more likely to come from a large
 * sibship than a randomly chosen parent is to have one, so the chance of a
 * sibship of size k is proportional to k·P(k). Sampling ego's own sibship from
 * the plain distribution systematically under-produces large families, and
 * because cousin counts scale with roughly the square of the reproductive rate,
 * the error compounds badly one generation out.
 */
export function sampleSibshipOfKnownChild(
  rng: Rng,
  demography: PedigreeDemography,
  cohort: FertilityCohort = 'ego',
): number {
  const sizeBiased = fertilityFor(demography, cohort).map(
    (weight, count) => weight * count,
  );
  return Math.max(1, sampleIndex(rng, sizeBiased));
}

/**
 * The most people a pedigree can contain under a parameter set.
 *
 * Feasibility counts worst cases, and a pedigree's size is drawn rather than
 * configured, so the bound is derived from the fertility distributions instead
 * of read off a config range. It is deliberately loose: over-counting can only
 * refuse a protocol that would have generated, while under-counting lets a
 * `unique` variable pass and then run out partway through a run.
 */
export function pedigreeNodeBound(demography: PedigreeDemography): number {
  const maxOf = (weights: readonly number[]) => Math.max(0, weights.length - 1);
  const ego = maxOf(demography.completedFertility);
  const parental = maxOf(demography.parentalFertility);
  const grand = maxOf(demography.grandparentalFertility);

  const core =
    1 + // ego
    2 + // parents
    4 + // grandparents
    Math.max(0, parental - 1) + // siblings
    2 * Math.max(0, grand - 1) * (2 + parental) + // aunts/uncles, partners, cousins
    1 + // ego's partner
    ego; // ego's children

  // Each varied conception can introduce one donor or carrier.
  return core * 2;
}

/**
 * The most edges a pedigree can contain: at most three parent links per person
 * (a donated gamete adds a third) plus one partnership per person.
 */
export function pedigreeEdgeBound(demography: PedigreeDemography): number {
  return pedigreeNodeBound(demography) * 4;
}
