/**
 * Framing identifiers and terminology for the FamilyPedigree interface.
 *
 * Two framings are supported: 'gamete' (biology-first language) and 'gendered'
 * (conventional mother/father language). Gestational carrier and donor terms
 * are intentionally identical across both framings.
 */
export const FRAMING_IDS = ['gamete', 'gendered'] as const;
export type FramingId = (typeof FRAMING_IDS)[number];

export const FRAMING_AUTHOR_LABELS: Record<FramingId, string> = {
  gamete: 'Gamete-based',
  gendered: 'Gendered',
};

export type FramingTerms = {
  eggParent: string;
  spermParent: string;
  gestationalCarrier: string;
  eggDonor: string;
  spermDonor: string;
};

export const FRAMING_TERMS: Record<FramingId, FramingTerms> = {
  gamete: {
    eggParent: 'Egg Parent',
    spermParent: 'Sperm Parent',
    gestationalCarrier: 'Gestational Carrier',
    eggDonor: 'Egg Donor',
    spermDonor: 'Sperm Donor',
  },
  gendered: {
    eggParent: 'Mother',
    spermParent: 'Father',
    gestationalCarrier: 'Gestational Carrier',
    eggDonor: 'Egg Donor',
    spermDonor: 'Sperm Donor',
  },
};
