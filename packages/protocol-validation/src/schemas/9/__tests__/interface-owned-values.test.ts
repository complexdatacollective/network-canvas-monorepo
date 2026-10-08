import { describe, expect, it } from 'vitest';

import {
  PEDIGREE_DEFAULT_GENDER_IDENTITIES,
  PEDIGREE_GENDER_WORDS,
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_RELATIONSHIP_KINDS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from '../family-pedigree-values.ts';

/**
 * These sets are schema 8's contract, not implementation detail: a protocol
 * that carries different members or labels is invalid. Pinning them literally
 * means a change to any of them fails here first, where the reviewer has to
 * decide whether it belongs in a new schema version.
 */
describe('schema 8 interface-owned values', () => {
  it('has the kinds of gender words an option can take', () => {
    expect(PEDIGREE_GENDER_WORDS).toEqual([
      'feminine',
      'masculine',
      'neutral',
      'unknown',
    ]);
  });

  it('seeds a gender identity attribute with six options and their default words', () => {
    expect(PEDIGREE_DEFAULT_GENDER_IDENTITIES).toEqual([
      { value: 'woman', words: 'feminine' },
      { value: 'man', words: 'masculine' },
      { value: 'nonBinary', words: 'neutral' },
      { value: 'differentIdentity', words: 'neutral' },
      { value: 'unknown', words: 'unknown' },
      { value: 'preferNotToSay', words: 'neutral' },
    ]);
  });

  it('has the canonical sex-assigned-at-birth values, with labels', () => {
    expect(PEDIGREE_SEX_ASSIGNED_AT_BIRTH).toEqual([
      'female',
      'male',
      'intersex',
      'unknown',
      'preferNotToSay',
    ]);
    expect(PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS).toEqual([
      { value: 'female', label: 'Female' },
      { value: 'male', label: 'Male' },
      { value: 'intersex', label: 'Intersex' },
      { value: 'unknown', label: 'Don’t know' },
      { value: 'preferNotToSay', label: 'Prefer not to say' },
    ]);
  });

  it('has the canonical relationship kinds, with labels', () => {
    expect(PEDIGREE_RELATIONSHIP_KINDS).toEqual([
      'partner',
      'biological',
      'adoptive',
      'social',
      'donor',
      'surrogate',
    ]);
    expect(PEDIGREE_RELATIONSHIP_KIND_OPTIONS).toEqual([
      { value: 'partner', label: 'Partner' },
      { value: 'biological', label: 'Biological parent' },
      { value: 'adoptive', label: 'Adoptive parent' },
      { value: 'social', label: 'Step or social parent' },
      { value: 'donor', label: 'Donor' },
      { value: 'surrogate', label: 'Surrogate' },
    ]);
  });
});
