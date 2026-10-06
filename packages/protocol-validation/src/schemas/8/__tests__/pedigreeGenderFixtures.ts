import { PEDIGREE_DEFAULT_GENDER_IDENTITIES } from '../family-pedigree-values.ts';

/**
 * The gender identity options a researcher's attribute is typically seeded
 * with, labelled as a protocol author might.
 */
export const GENDER_IDENTITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'nonBinary', label: 'Non-binary' },
  { value: 'differentIdentity', label: 'A different identity' },
  { value: 'unknown', label: 'Don’t know' },
  { value: 'preferNotToSay', label: 'Prefer not to say' },
];

/** The words each of `GENDER_IDENTITY_OPTIONS` takes by default. */
export const GENDER_IDENTITY_TERMS: {
  value: string;
  words: (typeof PEDIGREE_DEFAULT_GENDER_IDENTITIES)[number]['words'];
}[] = PEDIGREE_DEFAULT_GENDER_IDENTITIES.map(({ value, words }) => ({
  value,
  words,
}));
