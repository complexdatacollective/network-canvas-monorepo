import { describe, expect, it } from 'vitest';

import { FRAMING_IDS } from '@codaco/protocol-validation';

import { FRAMING_TERMS } from '../framingTerms';

describe('FRAMING_TERMS', () => {
  it('covers every framing the schema defines', () => {
    expect(Object.keys(FRAMING_TERMS).toSorted()).toEqual(
      FRAMING_IDS.toSorted(),
    );
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

  it('frames the gamete-provider question, hiding egg/sperm under gendered', () => {
    expect(FRAMING_TERMS.gamete.eggProviderQuestion).toBe(
      'Who provided the egg?',
    );
    expect(FRAMING_TERMS.gamete.spermProviderQuestion).toBe(
      'Who provided the sperm?',
    );
    expect(FRAMING_TERMS.gendered.eggProviderQuestion).toBe(
      'Who is the biological mother?',
    );
    expect(FRAMING_TERMS.gendered.spermProviderQuestion).toBe(
      'Who is the biological father?',
    );
    for (const id of FRAMING_IDS) {
      expect(FRAMING_TERMS[id].eggProviderHint).toContain('egg donor');
      expect(FRAMING_TERMS[id].spermProviderHint).toContain('sperm donor');
    }
  });
});
