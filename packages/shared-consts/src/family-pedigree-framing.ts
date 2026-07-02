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
  // The question (and its hint) asking which person contributed each gamete
  // when adding a child. Framed so the gendered framing never leaks "egg"/
  // "sperm" — every child-adding flow reads these instead of hardcoding.
  eggProviderQuestion: string;
  eggProviderHint: string;
  spermProviderQuestion: string;
  spermProviderHint: string;
};

export const FRAMING_TERMS: Record<FramingId, FramingTerms> = {
  gamete: {
    eggParent: 'Egg Parent',
    spermParent: 'Sperm Parent',
    gestationalCarrier: 'Gestational Carrier',
    eggDonor: 'Egg Donor',
    spermDonor: 'Sperm Donor',
    eggProviderQuestion: 'Who provided the egg?',
    eggProviderHint:
      'Select the person who provided the egg. If they were an egg donor, you can indicate that below.',
    spermProviderQuestion: 'Who provided the sperm?',
    spermProviderHint:
      'Select the person who provided the sperm. If they were a sperm donor, you can indicate that below.',
  },
  gendered: {
    eggParent: 'Mother',
    spermParent: 'Father',
    gestationalCarrier: 'Gestational Carrier',
    eggDonor: 'Egg Donor',
    spermDonor: 'Sperm Donor',
    eggProviderQuestion: 'Who is the biological mother?',
    eggProviderHint:
      'Select the biological mother. If she was an egg donor, you can indicate that below.',
    spermProviderQuestion: 'Who is the biological father?',
    spermProviderHint:
      'Select the biological father. If he was a sperm donor, you can indicate that below.',
  },
};
