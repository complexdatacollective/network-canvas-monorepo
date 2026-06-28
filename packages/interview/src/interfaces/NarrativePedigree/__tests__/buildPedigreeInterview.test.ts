import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { buildPedigreeInterview } from '../NarrativePedigree.stories';

// SyntheticInterview.getNetwork() fills any UNSET node attribute with a random
// faker value. The builder must therefore seed every boolean flag explicitly so
// ego identity and disease status are deterministic across seeds — otherwise the
// pedigree renders a random ego and random "affected" members.
const EGO_VAR = 'isEgo';
const HUNTINGTONS_VAR = 'hasHuntingtons';
const HAEMOPHILIA_VAR = 'hasHaemophilia';
const MITO_VAR = 'hasMitochondrialMyopathy';

const SEEDS = [1, 2, 3, 4];

describe('buildPedigreeInterview — deterministic synthetic data', () => {
  for (const seed of SEEDS) {
    const persons = buildPedigreeInterview(seed).getNetwork().nodes;

    const idsWith = (variable: string) =>
      persons
        .filter((n) => n[entityAttributesProperty][variable] === true)
        .map((n) => n[entityPrimaryKeyProperty])
        .sort();

    it(`seed ${seed}: exactly one ego`, () => {
      expect(idsWith(EGO_VAR)).toEqual(['ego']);
    });

    it(`seed ${seed}: each disease is set only on its seeded individuals`, () => {
      // 'cf' is Chris's father (partner-side) who also has Huntington's Disease.
      expect(idsWith(HUNTINGTONS_VAR)).toEqual(['cf', 'gf-pat', 'uncle']);
      expect(idsWith(HAEMOPHILIA_VAR)).toEqual(['father']);
      expect(idsWith(MITO_VAR)).toEqual(['gm']);
    });
  }
});
