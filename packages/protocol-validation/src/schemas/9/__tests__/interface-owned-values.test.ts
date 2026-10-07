import { describe, expect, it } from 'vitest';

import {
  BIOLOGICAL_SEX_OPTIONS,
  BIOLOGICAL_SEX_VALUES,
  FRAMING_IDS,
  GAMETE_ROLE_OPTIONS,
  GAMETE_ROLES,
  RELATIONSHIP_TYPE_OPTIONS,
  RELATIONSHIP_TYPES,
} from '../family-pedigree-values.ts';
import { INHERITANCE_PATTERNS } from '../narrative-pedigree-values.ts';

/**
 * These sets are schema 8's contract, not implementation detail: a protocol
 * that carries different members or labels is invalid. Pinning them literally
 * means a change to any of them fails here first, where the reviewer has to
 * decide whether it belongs in a new schema version.
 */
describe('schema 8 interface-owned values', () => {
  it('has the canonical relationship types, with labels', () => {
    expect(RELATIONSHIP_TYPES).toEqual([
      'biological',
      'social',
      'donor',
      'surrogate',
      'adoptive',
      'partner',
    ]);
    expect(RELATIONSHIP_TYPE_OPTIONS).toEqual([
      { value: 'biological', label: 'Biological' },
      { value: 'social', label: 'Social' },
      { value: 'donor', label: 'Donor' },
      { value: 'surrogate', label: 'Surrogate' },
      { value: 'adoptive', label: 'Adoptive' },
      { value: 'partner', label: 'Partner' },
    ]);
  });

  it('has the canonical gamete roles, with labels', () => {
    expect(GAMETE_ROLES).toEqual(['egg', 'sperm']);
    expect(GAMETE_ROLE_OPTIONS).toEqual([
      { value: 'egg', label: 'Egg' },
      { value: 'sperm', label: 'Sperm' },
    ]);
  });

  it('has the canonical biological-sex values, with participant-facing labels', () => {
    expect(BIOLOGICAL_SEX_VALUES).toEqual([
      'female',
      'male',
      'intersex',
      'unknown',
      'preferNotToSay',
    ]);
    expect(BIOLOGICAL_SEX_OPTIONS).toEqual([
      { value: 'female', label: 'Female' },
      { value: 'male', label: 'Male' },
      {
        value: 'intersex',
        label: 'Intersex or a variation in sex characteristics',
      },
      { value: 'unknown', label: 'Don’t know' },
      { value: 'preferNotToSay', label: 'Prefer not to say' },
    ]);
  });

  it('has exactly two framings', () => {
    expect(FRAMING_IDS).toEqual(['gamete', 'gendered']);
  });

  it('has the canonical inheritance patterns', () => {
    expect(INHERITANCE_PATTERNS).toEqual([
      'autosomalDominant',
      'autosomalRecessive',
      'xLinkedDominant',
      'xLinkedRecessive',
      'yLinked',
      'mitochondrial',
      'multifactorial',
      'unknown',
    ]);
  });
});
