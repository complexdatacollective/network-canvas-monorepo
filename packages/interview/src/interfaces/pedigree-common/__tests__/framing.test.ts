import { describe, expect, it } from 'vitest';

import { pedigreeFraming } from '../framing';

describe('pedigreeFraming', () => {
  it('uses a fixed setting whatever the participant chose', () => {
    expect(pedigreeFraming('gendered', 'gamete')).toBe('gendered');
    expect(pedigreeFraming('gamete', 'gendered')).toBe('gamete');
  });

  it('uses gendered words when the stage has no setting', () => {
    expect(pedigreeFraming(undefined, undefined)).toBe('gendered');
  });

  it('uses the participant’s choice, or words assuming no gender before they choose', () => {
    expect(pedigreeFraming('participantPreference', 'gendered')).toBe(
      'gendered',
    );
    expect(pedigreeFraming('participantPreference', undefined)).toBe('gamete');
  });
});
