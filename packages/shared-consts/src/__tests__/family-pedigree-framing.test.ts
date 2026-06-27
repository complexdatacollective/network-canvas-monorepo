import { describe, expect, it } from 'vitest';

import { BIOLOGICAL_SEX_VALUES } from '../family-pedigree';
import {
  FRAMING_IDS,
  FRAMING_AUTHOR_LABELS,
  FRAMING_TERMS,
} from '../family-pedigree-framing';

describe('family-pedigree-framing', () => {
  it('has exactly two framings with author labels', () => {
    expect(FRAMING_IDS).toEqual(['gamete', 'gendered']);
    expect(FRAMING_AUTHOR_LABELS).toEqual({
      gamete: 'Gamete-based',
      gendered: 'Gendered',
    });
  });
  it('maps gamete vs gendered parent terms, sharing carrier/donor', () => {
    expect(FRAMING_TERMS.gamete.eggParent).toBe('Egg Parent');
    expect(FRAMING_TERMS.gamete.spermParent).toBe('Sperm Parent');
    expect(FRAMING_TERMS.gendered.eggParent).toBe('Mother');
    expect(FRAMING_TERMS.gendered.spermParent).toBe('Father');
    for (const id of FRAMING_IDS) {
      expect(FRAMING_TERMS[id].gestationalCarrier).toBe('Gestational Carrier');
      expect(FRAMING_TERMS[id].eggDonor).toBe('Egg Donor');
      expect(FRAMING_TERMS[id].spermDonor).toBe('Sperm Donor');
    }
  });
  it('exposes the canonical biological-sex values', () => {
    expect(BIOLOGICAL_SEX_VALUES).toEqual([
      'female',
      'male',
      'intersex',
      'unknown',
    ]);
  });
});
