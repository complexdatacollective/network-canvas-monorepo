import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { buildComprehensivePedigree } from '../comprehensivePedigreeFixture';

// SyntheticInterview.getNetwork() fills any UNSET node attribute with a random
// faker value for count-based nodes; the fixture seeds every person via
// addManualNode (which leaves unset attributes neutral, boolean -> false) so ego
// identity and disease status stay deterministic across seeds.
const EGO_VAR = 'isEgo';
const HD_VAR = 'hasHuntingtons';
const CF_VAR = 'hasCysticFibrosis';
const HAEM_VAR = 'hasHaemophilia';
const XLH_VAR = 'hasHypophosphataemia';
const YHL_VAR = 'hasYLinkedHearingLoss';
const MITO_VAR = 'hasMitochondrialMyopathy';

const SEEDS = [1, 2, 3, 4];

describe('comprehensive pedigree — deterministic synthetic data', () => {
  for (const seed of SEEDS) {
    const persons = buildComprehensivePedigree(seed).getNetwork().nodes;

    const idsWith = (variable: string) =>
      persons
        .filter((n) => n[entityAttributesProperty][variable] === true)
        .map((n) => n[entityPrimaryKeyProperty])
        .sort();

    it(`seed ${seed}: exactly one ego`, () => {
      expect(idsWith(EGO_VAR)).toEqual(['ego']);
    });

    it(`seed ${seed}: each condition is nominated only on its seeded individuals`, () => {
      // Huntington's (autosomal dominant): Arthur and Rose on the maternal line.
      expect(idsWith(HD_VAR)).toEqual(['mgf', 'mother']);
      // Cystic fibrosis (autosomal recessive): the consanguineous cousins' child.
      expect(idsWith(CF_VAR)).toEqual(['cfchild']);
      // Haemophilia (X-linked recessive): the two affected Marsh brothers.
      expect(idsWith(HAEM_VAR)).toEqual(['unc1', 'unc2']);
      // X-linked hypophosphataemia (X-linked dominant): the partner's father.
      expect(idsWith(XLH_VAR)).toEqual(['pf']);
      // Y-linked hearing loss: the older Sullivan males (Owen is inferred).
      expect(idsWith(YHL_VAR)).toEqual(['brother', 'father', 'pgf']);
      // Mitochondrial: the maternal grandmother.
      expect(idsWith(MITO_VAR)).toEqual(['mgm']);
    });
  }
});
