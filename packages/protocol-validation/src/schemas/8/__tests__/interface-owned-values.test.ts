import { describe, expect, it } from 'vitest';

import {
  PEDIGREE_GENDER_IDENTITIES,
  PEDIGREE_GENDER_IDENTITY_OPTIONS,
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
  it('has the canonical gender identities, with participant-facing labels', () => {
    expect(PEDIGREE_GENDER_IDENTITIES).toEqual([
      'woman',
      'man',
      'nonBinary',
      'differentIdentity',
      'unknown',
      'preferNotToSay',
    ]);
    expect(PEDIGREE_GENDER_IDENTITY_OPTIONS).toEqual([
      { value: 'woman', label: 'Woman' },
      { value: 'man', label: 'Man' },
      { value: 'nonBinary', label: 'Non-binary' },
      { value: 'differentIdentity', label: 'A different identity' },
      { value: 'unknown', label: 'Don’t know' },
      { value: 'preferNotToSay', label: 'Prefer not to say' },
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
