import type {
  BiologicalSex,
  GameteRole,
  InheritancePattern,
  RelationshipType,
} from '@codaco/shared-consts';

export type FamilyPedigreeWeightedCount = {
  value: number;
  weight: number;
};

export const PEDIGREE_RELATIONSHIP_TO_EGO_VALUES = [
  'Parent',
  'Social Parent',
  'Donor',
  'Surrogate',
  'Sibling',
  'Partner',
  'Child',
  'Grandparent',
  'Aunt/Uncle',
  'Cousin',
] as const;

export type PedigreeRelationshipToEgo =
  (typeof PEDIGREE_RELATIONSHIP_TO_EGO_VALUES)[number];

/**
 * Population assumptions used to grow a pedigree. A profile is deliberately
 * data rather than code so callers can substitute a population appropriate to
 * their study instead of treating the bundled US reference as universal.
 */
export type FamilyPedigreePopulationProfile = {
  id: string;
  label: string;
  sources: readonly string[];
  /** Completed number of children per reproductive family. */
  completedFamilySize: readonly FamilyPedigreeWeightedCount[];
  /** Probability that a birth is recorded female. */
  femaleAtBirthProbability: number;
  /** Probability that a childless focal adult currently has a partner. */
  childlessPartnerProbability: number;
  /** Mutually exclusive probabilities for the focal person's parentage. */
  scenarios: {
    adoption: number;
    donorConception: number;
    surrogacy: number;
  };
};

export type FamilyPedigreeScenario =
  | 'population'
  | 'none'
  | 'adoption'
  | 'donorConception'
  | 'surrogacy';

export type FamilyPedigreeDiseaseMode = 'visualization' | 'none';

export type FamilyPedigreeGenerationOptions = {
  /** Reference population used for family size and scenario sampling. */
  population?: FamilyPedigreePopulationProfile;
  /** Population sampling by default; a named value forces a test scenario. */
  scenario?: FamilyPedigreeScenario;
  /**
   * `visualization` plants inheritance-pattern-aware affected lineages;
   * `none` writes every nomination variable as unaffected.
   */
  diseaseMode?: FamilyPedigreeDiseaseMode;
  /** Safety cap for optional collateral branches. Core required kin may exceed it. */
  maxNodes?: number;
};

export type ResolvedFamilyPedigreeGenerationOptions = {
  population: FamilyPedigreePopulationProfile;
  scenario: FamilyPedigreeScenario;
  diseaseMode: FamilyPedigreeDiseaseMode;
  maxNodes: number;
};

export type PedigreeDisease = {
  variable: string;
  inheritancePattern: InheritancePattern | 'unknown';
};

export type PedigreePerson = {
  key: string;
  generation: number;
  /** The canonical value FamilyPedigree itself writes, when it can derive one. */
  relationshipToEgo: PedigreeRelationshipToEgo | undefined;
  biologicalSex: BiologicalSex;
  affectedVariables: ReadonlySet<string>;
};

export type PedigreeRelationship = {
  from: string;
  to: string;
  relationshipType: RelationshipType;
  isActive: boolean;
  isGestationalCarrier?: true;
  gameteRole?: GameteRole;
};

export type FamilyPedigreePlan = {
  people: readonly PedigreePerson[];
  relationships: readonly PedigreeRelationship[];
  egoKey: string;
  scenario: Exclude<FamilyPedigreeScenario, 'population'>;
  hasEgoChildren: boolean;
};
