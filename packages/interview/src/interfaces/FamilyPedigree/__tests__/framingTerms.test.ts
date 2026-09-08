import { describe, expect, it } from 'vitest';

import { FRAMING_IDS } from '@codaco/protocol-validation';

import { getFramingTerms } from '../framingTerms';

const terms = {
  gamete: getFramingTerms('gamete'),
  gendered: getFramingTerms('gendered'),
};

describe('terms', () => {
  it('covers every framing the schema defines', () => {
    expect(Object.keys(terms).toSorted()).toEqual(FRAMING_IDS.toSorted());
  });

  it('maps gamete vs gendered parent terms, sharing carrier/donor', () => {
    expect(terms.gamete.eggParent).toBe('Egg Parent');
    expect(terms.gamete.spermParent).toBe('Sperm Parent');
    expect(terms.gendered.eggParent).toBe('Mother');
    expect(terms.gendered.spermParent).toBe('Father');
    for (const id of FRAMING_IDS) {
      expect(terms[id].gestationalCarrier).toBe('Gestational Carrier');
      expect(terms[id].eggDonor).toBe('Egg Donor');
      expect(terms[id].spermDonor).toBe('Sperm Donor');
    }
  });

  it('frames the gamete-provider question, hiding egg/sperm under gendered', () => {
    expect(terms.gamete.eggProviderQuestion).toBe('Who provided the egg?');
    expect(terms.gamete.spermProviderQuestion).toBe('Who provided the sperm?');
    expect(terms.gendered.eggProviderQuestion).toBe(
      'Who is the biological mother?',
    );
    expect(terms.gendered.spermProviderQuestion).toBe(
      'Who is the biological father?',
    );
    for (const id of FRAMING_IDS) {
      expect(terms[id].eggProviderHint).toContain('egg donor');
      expect(terms[id].spermProviderHint).toContain('sperm donor');
    }
  });
});
