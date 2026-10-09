import { describe, expect, test } from 'vitest';

import type { NcEdge, NcNode } from '@codaco/shared-consts';

import {
  type AddRelativeRequest,
  type Family,
  planAddRelative,
  readFamily,
} from '../model';
import { config, link, person } from './fixtures';

const family = (nodes: NcNode[], edges: NcEdge[] = []) =>
  readFamily(nodes, edges, config);

const plan = (f: Family, request: AddRelativeRequest) => {
  let counter = 0;
  return planAddRelative({
    family: f,
    anchorId: 'ego',
    newPersonId: 'added',
    details: {},
    request,
    createId: () => `new-${++counter}`,
    sexAttribute: config.sexAssignedAtBirthAttribute,
  });
};

// Ruling 20: the sibling form offers the participant's donors among the
// shared-parent choices, so a sibling who shares only a donor can be added.
describe('a sibling who shares a donor', () => {
  const twoMothersAndADonor = () =>
    family(
      [
        person('ego', { isEgo: true }),
        person('amy', { name: 'Amy', sex: ['female'] }),
        person('beth', { name: 'Beth', sex: ['female'] }),
        person('donor', { sex: ['male'] }),
      ],
      [
        link('amy', 'beth', 'partner'),
        link('amy', 'ego', 'biological', { carrier: true }),
        link('beth', 'ego', 'social'),
        link('donor', 'ego', 'donor'),
      ],
    );

  test('is their donor too', () => {
    const result = plan(twoMothersAndADonor(), {
      relation: 'sibling',
      sharedParentIds: ['amy', 'beth', 'donor'],
      sharesUnshown: 'none',
      parentKind: 'biological',
      carrier: null,
    });
    expect(result.links).toEqual([
      { source: 'donor', target: 'added', kind: 'donor' },
      { source: 'amy', target: 'added', kind: 'biological' },
      { source: 'beth', target: 'added', kind: 'social' },
    ]);
  });

  test('can share only the donor', () => {
    const result = plan(twoMothersAndADonor(), {
      relation: 'sibling',
      sharedParentIds: ['donor'],
      sharesUnshown: 'none',
      parentKind: 'biological',
      carrier: null,
    });
    // A stand-in fills their other genetic parent (ruling 25).
    expect(result.links).toEqual([
      { source: 'donor', target: 'added', kind: 'donor' },
      { source: 'new-1', target: 'added', kind: 'biological' },
    ]);
  });
});

// Ruling 26: a biological sibling of two parents of whom only one could be
// their genetic parent names which.
describe('a biological sibling of two mothers', () => {
  test('is the biological child of the mother named', () => {
    const f = family(
      [
        person('ego', { isEgo: true }),
        person('ann', { name: 'Ann', sex: ['female'] }),
        person('bea', { name: 'Bea', sex: ['female'] }),
      ],
      [link('ann', 'ego', 'adoptive'), link('bea', 'ego', 'adoptive')],
    );
    const result = plan(f, {
      relation: 'sibling',
      sharedParentIds: ['ann', 'bea'],
      sharesUnshown: 'none',
      parentKind: 'biological',
      biologicalParentId: 'bea',
      carrier: null,
    });
    expect(
      result.links
        .filter(
          (planned) => planned.source === 'ann' || planned.source === 'bea',
        )
        .map((planned) => [planned.source, planned.kind]),
    ).toEqual([
      ['bea', 'biological'],
      ['ann', 'adoptive'],
    ]);
  });
});
