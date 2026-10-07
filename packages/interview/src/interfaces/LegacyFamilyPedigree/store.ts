// TODO(narrative-pedigree-rebuild): this directory is the pre-redesign Family
// Pedigree that the Narrative Pedigree still reads. It is kept only so that
// interface compiles; delete it once the Narrative Pedigree is rebuilt against
// the redesigned Family Pedigree's model.
import type { NcEdge } from '@codaco/shared-consts';

import type { GameteRole } from './legacyValues';

/** The codebook keys of the pre-redesign Family Pedigree stage's slots. */
export type VariableConfig = {
  nodeType: string;
  edgeType: string;
  nodeLabelVariable: string;
  egoVariable: string;
  /** Text node variable storing the computed relationship to ego. */
  relationshipVariable: string;
  relationshipTypeVariable: string;
  isActiveVariable: string;
  isGestationalCarrierVariable: string;
  /** Edge variable storing the gamete role ('egg'|'sperm') of a biological/donor parent. */
  gameteRoleVariable: string;
  /** Node variable storing each person's reported biological sex. */
  biologicalSexVariable: string;
};

export type { GameteRole };

/** A pedigree edge. gameteRole is stored in `attributes[gameteRoleVariable]`. */
export type FamilyEdge = NcEdge;
