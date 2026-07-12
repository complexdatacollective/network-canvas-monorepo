/**
 * Framing identifiers and terminology for the FamilyPedigree interface.
 *
 * Two framings are supported: 'gamete' (biology-first language) and 'gendered'
 * (mother/father kinship terms). Gestational carrier and donor terms
 * are intentionally identical across both framings.
 */
export const FRAMING_IDS = ['gamete', 'gendered'] as const;
export type FramingId = (typeof FRAMING_IDS)[number];

type FramingLookup<Value> = {
  [Id in FramingId]: Value;
};

export const FRAMING_AUTHOR_LABELS: FramingLookup<string> = {
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
  // Whole participant-facing phrases that must NOT be assembled at the call site
  // by prepending an article/possessive/prefix (e.g. "an", "your", "New",
  // "Unknown") to a term and lower-casing it — that grammar interpolation is not
  // localisable. The donor questions are framing-invariant (the donor terms are),
  // but are kept here so every framed phrase lives in one place.
  eggDonorQuestion: string;
  spermDonorQuestion: string;
  yourEggParent: string;
  yourSpermParent: string;
  newEggParent: string;
  newSpermParent: string;
  unknownEggParent: string;
  unknownSpermParent: string;
};

export const FRAMING_TERMS: FramingLookup<FramingTerms> = {
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
    eggDonorQuestion: 'Was this person an egg donor?',
    spermDonorQuestion: 'Was this person a sperm donor?',
    yourEggParent: 'your egg parent',
    yourSpermParent: 'your sperm parent',
    newEggParent: 'New egg parent',
    newSpermParent: 'New sperm parent',
    unknownEggParent: 'Unknown egg parent',
    unknownSpermParent: 'Unknown sperm parent',
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
    eggDonorQuestion: 'Was this person an egg donor?',
    spermDonorQuestion: 'Was this person a sperm donor?',
    yourEggParent: 'your mother',
    yourSpermParent: 'your father',
    newEggParent: 'New mother',
    newSpermParent: 'New father',
    unknownEggParent: 'Unknown mother',
    unknownSpermParent: 'Unknown father',
  },
};
