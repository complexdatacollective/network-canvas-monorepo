import { describe, expect, it } from 'vitest';

import type { BiologicalSex } from '@codaco/shared-consts';

import { inferGameteProviders } from '../inferGameteProviders';

const FALLBACK = {
  eggSource: 'ego',
  spermSource: 'partner',
  carrier: 'egg-source',
  eggParentCarried: true,
};

const ego = (sex: BiologicalSex | undefined) => ({ value: 'ego', sex });
const partner = (sex: BiologicalSex | undefined) => ({ value: 'partner', sex });

describe('inferGameteProviders', () => {
  it('female ego + male partner: ego → egg, partner → sperm', () => {
    expect(
      inferGameteProviders(ego('female'), partner('male'), FALLBACK),
    ).toEqual({
      eggSource: 'ego',
      spermSource: 'partner',
      carrier: 'egg-source',
      eggParentCarried: true,
    });
  });

  it('male ego + female partner: swaps so the female provides the egg', () => {
    expect(
      inferGameteProviders(ego('male'), partner('female'), FALLBACK),
    ).toEqual({
      eggSource: 'partner',
      spermSource: 'ego',
      carrier: 'egg-source',
      eggParentCarried: true,
    });
  });

  it('two female parents: one provides the egg, sperm left blank (donor)', () => {
    expect(
      inferGameteProviders(ego('female'), partner('female'), FALLBACK),
    ).toEqual({
      eggSource: 'ego',
      spermSource: undefined,
      carrier: 'egg-source',
      eggParentCarried: true,
    });
  });

  it('two male parents: one provides sperm, egg blank, someone else carried', () => {
    expect(
      inferGameteProviders(ego('male'), partner('male'), FALLBACK),
    ).toEqual({
      eggSource: undefined,
      spermSource: 'ego',
      carrier: undefined,
      eggParentCarried: false,
    });
  });

  const inconclusiveSexes: (BiologicalSex | undefined)[] = [
    'unknown',
    'intersex',
    'preferNotToSay',
    undefined,
  ];
  it.each(inconclusiveSexes)(
    'falls back to the positional default when a sex is %s',
    (sex) => {
      expect(inferGameteProviders(ego('female'), partner(sex), FALLBACK)).toBe(
        FALLBACK,
      );
      expect(inferGameteProviders(ego(sex), partner('male'), FALLBACK)).toBe(
        FALLBACK,
      );
    },
  );
});
