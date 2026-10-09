import { describe, expect, it } from 'vitest';

import type { FamilyLink } from '../model';
import { reproductiveRolesOf } from '../reproductiveRoles';

const link = (
  source: string,
  target: string,
  kind: FamilyLink['kind'],
  isGestationalCarrier = false,
): FamilyLink => ({
  id: `${source}-${target}`,
  source,
  target,
  kind,
  isGestationalCarrier,
  isCurrentPartner: false,
});

describe('reproductive roles read out with a symbol', () => {
  it.each([
    ['a donor who did not carry', link('d', 'kid', 'donor'), ['donor']],
    [
      'a donor who carried (a traditional surrogate)',
      link('d', 'kid', 'donor', true),
      ['traditionalSurrogate'],
    ],
    [
      'a surrogate (a gestational carrier)',
      link('d', 'kid', 'surrogate', true),
      ['gestationalCarrier'],
    ],
    [
      'a biological parent who carried',
      link('d', 'kid', 'biological', true),
      [],
    ],
    ['an adoptive parent who carried', link('d', 'kid', 'adoptive', true), []],
    ['a social parent who carried', link('d', 'kid', 'social', true), []],
    ['a partner', link('d', 'kid', 'partner'), []],
  ] as const)('%s', (_, given, roles) => {
    expect(reproductiveRolesOf([given], 'd')).toEqual(roles);
  });

  it('lists each role once, in a fixed order, from the person’s own links', () => {
    expect(
      reproductiveRolesOf(
        [
          link('d', 'kid1', 'surrogate', true),
          link('d', 'kid2', 'donor'),
          link('d', 'kid3', 'donor'),
          link('other', 'd', 'donor', true),
        ],
        'd',
      ),
    ).toEqual(['donor', 'gestationalCarrier']);
  });
});
