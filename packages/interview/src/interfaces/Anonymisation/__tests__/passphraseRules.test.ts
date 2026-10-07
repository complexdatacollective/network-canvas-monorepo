import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import {
  passphraseLengthRules,
  protocolPassphraseLengthRules,
} from '../passphraseRules';

/**
 * Every pair of rules here has to leave a length a participant can choose: a
 * default minimum above the researcher's own maximum would refuse every
 * passphrase, and the interview could never be finished.
 */
describe('passphraseLengthRules', () => {
  it.each([
    { label: 'no rules', validation: undefined, expected: { minLength: 8 } },
    {
      label: 'a maximum below the default minimum',
      validation: { maxLength: 6 },
      expected: { minLength: 6, maxLength: 6 },
    },
    {
      label: 'a maximum above the default minimum',
      validation: { maxLength: 12 },
      expected: { minLength: 8, maxLength: 12 },
    },
    {
      label: 'both lengths',
      validation: { minLength: 4, maxLength: 6 },
      expected: { minLength: 4, maxLength: 6 },
    },
    {
      label: 'a minimum above the default and no maximum',
      validation: { minLength: 10 },
      expected: { minLength: 10 },
    },
  ])('applies $expected for $label', ({ validation, expected }) => {
    expect(passphraseLengthRules(validation)).toEqual(expected);
  });

  /**
   * Schema 9 refuses both, and the 8 to 9 migration removes the inverted pair,
   * but a stored row validated before that can still bring them. Choosing a
   * passphrase has to stay possible whatever arrives.
   */
  it.each([
    {
      label: 'ignores both lengths when the minimum is above the maximum',
      validation: { minLength: 9, maxLength: 6 },
      expected: { minLength: 8 },
    },
    {
      label: 'ignores a maximum of no characters',
      validation: { maxLength: 0 },
      expected: { minLength: 8 },
    },
    {
      label: 'ignores a maximum of no characters beside a minimum',
      validation: { minLength: 0, maxLength: 0 },
      expected: { minLength: 0 },
    },
  ])('$label', ({ validation, expected }) => {
    const rules = passphraseLengthRules(validation);

    expect(rules).toEqual(expected);
    expect(rules.minLength).toBeLessThanOrEqual(
      rules.maxLength ?? Number.POSITIVE_INFINITY,
    );
  });
});

describe('protocolPassphraseLengthRules', () => {
  const anonymisation = {
    id: 'anonymisation',
    type: 'Anonymisation',
    label: 'Anonymisation',
    explanationText: { title: 'Privacy', body: 'Choose a passphrase.' },
    validation: { maxLength: 6 },
  } satisfies Stage;

  it('lowers the default minimum to the stage’s shorter maximum', () => {
    expect(protocolPassphraseLengthRules([anonymisation])).toEqual({
      minLength: 6,
      maxLength: 6,
    });
  });

  it('applies the default minimum in a protocol without the stage', () => {
    expect(protocolPassphraseLengthRules([])).toEqual({ minLength: 8 });
  });
});
