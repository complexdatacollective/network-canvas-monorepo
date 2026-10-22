import { describe, expect, it } from 'vitest';

import type { PedigreeSexAssignedAtBirth } from '@codaco/protocol-validation';
import type { VariableValue } from '@codaco/shared-consts';

import { gameteLookup, inferGametes } from '../gametes';
import { readFamily } from '../model';
import { config, link, person } from './fixtures';

const withSex = (
  id: string,
  sex?: PedigreeSexAssignedAtBirth,
  extra: Record<string, VariableValue> = {},
) => person(id, { ...(sex ? { sex: [sex] } : {}), ...extra });

/** A child of `a` and `b`, both biological parents, with the sexes given. */
function trio(
  aSex: PedigreeSexAssignedAtBirth | undefined,
  bSex: PedigreeSexAssignedAtBirth | undefined,
) {
  return readFamily(
    [withSex('a', aSex), withSex('b', bSex), withSex('child', 'male')],
    [
      link('a', 'b', 'partner'),
      link('a', 'child', 'biological'),
      link('b', 'child', 'biological'),
    ],
    config,
  );
}

describe('inferGametes', () => {
  it('gives the egg to the parent recorded female and the sperm to the one recorded male', () => {
    const gametes = inferGametes(trio('female', 'male'));
    expect(gametes.get('a>child')).toBe('egg');
    expect(gametes.get('b>child')).toBe('sperm');
  });

  it.each(['intersex', 'unknown', 'preferNotToSay', undefined] as const)(
    'gives a parent recorded %s, paired with a binary parent, the other gamete by elimination',
    (sex) => {
      expect(inferGametes(trio(sex, 'male')).get('a>child')).toBe('egg');
      expect(inferGametes(trio(sex, 'female')).get('a>child')).toBe('sperm');
    },
  );

  it('leaves both gametes unknown when neither parent is recorded female or male', () => {
    expect(inferGametes(trio('intersex', 'unknown')).size).toBe(0);
    expect(inferGametes(trio('intersex', 'intersex')).size).toBe(0);
  });

  it('leaves the gamete of a single genetic parent who is neither female nor male unknown', () => {
    const family = readFamily(
      [withSex('a', 'intersex'), withSex('child')],
      [link('a', 'child', 'biological')],
      config,
    );
    expect(inferGametes(family).size).toBe(0);
  });

  it('follows sex assigned at birth for trans parents, whatever their gender identity', () => {
    const family = readFamily(
      [
        withSex('transMan', 'female', { gender: ['man'] }),
        withSex('transWoman', 'male', { gender: ['transWoman'] }),
        withSex('child'),
      ],
      [
        link('transMan', 'child', 'biological'),
        link('transWoman', 'child', 'biological'),
      ],
      config,
    );
    const gameteOf = gameteLookup(inferGametes(family));
    expect(gameteOf('transMan', 'child')).toBe('egg');
    expect(gameteOf('transWoman', 'child')).toBe('sperm');
  });

  it('reads donors as genetic parents and leaves out surrogates and social parents', () => {
    const family = readFamily(
      [
        withSex('donor', 'female'),
        withSex('dad', 'male'),
        withSex('surrogate', 'female'),
        withSex('stepmum', 'female'),
        withSex('child'),
      ],
      [
        link('donor', 'child', 'donor'),
        link('dad', 'child', 'biological'),
        link('surrogate', 'child', 'surrogate', { carrier: true }),
        link('stepmum', 'child', 'social'),
      ],
      config,
    );
    const gametes = inferGametes(family);
    expect(gametes.get('donor>child')).toBe('egg');
    expect(gametes.get('dad>child')).toBe('sperm');
    expect(gametes.has('surrogate>child')).toBe(false);
    expect(gametes.has('stepmum>child')).toBe(false);
  });
});
