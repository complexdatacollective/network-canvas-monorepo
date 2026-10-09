import { describe, expect, it } from 'vitest';

import { CurrentProtocolSchema } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { buildCegrmInterview } from '../CEGRM.stories';
import { buildComprehensivePedigree } from '../comprehensivePedigreeFixture';

// SyntheticInterview.getNetwork() fills any UNSET node attribute with a random
// faker value for count-based nodes; the fixture seeds every person via
// addManualNode (which leaves unset attributes neutral, boolean -> false) so ego
// identity and disease status stay deterministic across seeds. Attributes are
// found by the Narrative Pedigree's disease ids and the Family Pedigree's
// participant marker.
const SEEDS = [1, 2, 3, 4];

describe('pedigree demonstration protocols', () => {
  it.each([
    ['comprehensive', buildComprehensivePedigree(1)],
    ['CEGRM inherited statuses', buildCegrmInterview(11).si],
    ['CEGRM recorded history', buildCegrmInterview(11, true).si],
  ])(
    'validates the %s scenario against the current schema',
    async (_, interview) => {
      const { schemaVersion, localization, codebook, stages } =
        interview.getProtocol();
      const result = await CurrentProtocolSchema.safeParseAsync({
        name: 'Pedigree demonstration',
        schemaVersion,
        localization,
        codebook,
        stages,
        assetManifest: {},
      });
      expect(result.success, JSON.stringify(result, null, 2)).toBe(true);
    },
  );
});

describe('comprehensive pedigree — deterministic synthetic data', () => {
  for (const seed of SEEDS) {
    const si = buildComprehensivePedigree(seed);
    const persons = si.getNetwork().nodes;
    const { stages } = si.getProtocol();
    const source = stages.find((stage) => stage.type === 'FamilyPedigree');
    const narrative = stages.find(
      (stage) => stage.type === 'NarrativePedigree',
    );
    const EGO_VAR =
      source?.type === 'FamilyPedigree'
        ? source.nodeConfiguration.egoAttribute
        : '';
    const attributeOf = (disease: string) =>
      (narrative?.type === 'NarrativePedigree'
        ? narrative.diseases.find((candidate) => candidate.id === disease)
            ?.attribute
        : undefined) ?? '';
    const HD_VAR = attributeOf('huntingtons');
    const CF_VAR = attributeOf('cysticFibrosis');
    const HAEM_VAR = attributeOf('haemophilia');
    const XLH_VAR = attributeOf('hypophosphataemia');
    const YHL_VAR = attributeOf('yLinkedHearingLoss');
    const MITO_VAR = attributeOf('mitochondrial');

    const idsWith = (variable: string) =>
      persons
        .filter(
          (n) =>
            variable !== '' && n[entityAttributesProperty][variable] === true,
        )
        .map((n) => n[entityPrimaryKeyProperty])
        .sort();

    it(`seed ${seed}: exactly one ego`, () => {
      expect(idsWith(EGO_VAR)).toEqual(['ego']);
    });

    it(`seed ${seed}: each condition is nominated only on its seeded individuals`, () => {
      // Huntington's (autosomal dominant): George and Rose on the maternal line.
      expect(idsWith(HD_VAR)).toEqual(['mgf', 'mother']);
      // Cystic fibrosis (autosomal recessive): ego's affected sibling (autozygous
      // via the consanguineous parents).
      expect(idsWith(CF_VAR)).toEqual(['sib']);
      // Haemophilia (X-linked recessive): the two affected maternal uncles.
      expect(idsWith(HAEM_VAR)).toEqual(['muncle', 'muncle2']);
      // X-linked hypophosphataemia (X-linked dominant): ego's father.
      expect(idsWith(XLH_VAR)).toEqual(['father']);
      // Y-linked hearing loss: the partner's Adler male line (Noah is inferred).
      expect(idsWith(YHL_VAR)).toEqual(['partner', 'pf']);
      // Mitochondrial: the maternal great-grandmother.
      expect(idsWith(MITO_VAR)).toEqual(['ggm']);
    });
  }
});
