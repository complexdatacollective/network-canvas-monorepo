import { describe, expect, test } from 'vitest';

import type { NcEdge, NcNode } from '@codaco/shared-consts';

import {
  type AddRelativeRequest,
  type Family,
  planAddRelative,
  possibleCarriers,
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
      parentKind: 'biological',
      carrier: null,
    });
    expect(result.links).toEqual([
      {
        source: 'donor',
        target: 'added',
        kind: 'donor',
        isGestationalCarrier: false,
      },
      { source: 'amy', target: 'added', kind: 'biological' },
      { source: 'beth', target: 'added', kind: 'social' },
    ]);
  });

  test('can share only the donor', () => {
    const result = plan(twoMothersAndADonor(), {
      relation: 'sibling',
      sharedParentIds: ['donor'],
      parentKind: 'biological',
      carrier: null,
    });
    // A stand-in fills their other genetic parent (ruling 25).
    expect(result.links).toEqual([
      {
        source: 'donor',
        target: 'added',
        kind: 'donor',
        isGestationalCarrier: false,
      },
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
      parentKind: 'biological',
      biologicalParentIds: ['bea'],
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

// A biological sibling sharing three parents, two of whom could each be their
// genetic father, is recorded with the genetic parents the participant
// named, never one taken from the order the parents were recorded in.
describe('a biological sibling of three shared parents', () => {
  const threeParents = () =>
    family(
      [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('sarah', { name: 'Sarah', sex: ['female'] }),
        person('tom', { name: 'Tom', sex: ['male'] }),
        person('raj', { name: 'Raj', sex: ['male'] }),
      ],
      [
        link('sarah', 'ego', 'biological', { carrier: true }),
        link('tom', 'ego', 'biological'),
        link('raj', 'ego', 'social'),
        link('sarah', 'tom', 'partner', { current: false }),
        link('sarah', 'raj', 'partner'),
      ],
    );

  test('is the biological child of both parents named', () => {
    const result = plan(threeParents(), {
      relation: 'sibling',
      sharedParentIds: ['sarah', 'tom', 'raj'],
      parentKind: 'biological',
      biologicalParentIds: ['sarah', 'raj'],
      carrier: null,
    });
    expect(
      result.links
        .filter((planned) => planned.target === 'added')
        .map((planned) => [planned.source, planned.kind]),
    ).toEqual([
      ['sarah', 'biological'],
      ['raj', 'biological'],
      ['tom', 'social'],
    ]);
  });
});

// Decided gap (9 Oct 2026): the sibling form offers the participant's
// surrogate among the shared-parent choices, as ruling 20 offers donors.
describe('a sibling who shares the surrogate who carried the participant', () => {
  const parentsAndASurrogate = () =>
    family(
      [
        person('ego', { isEgo: true }),
        person('amy', { name: 'Amy', sex: ['female'] }),
        person('rob', { name: 'Rob', sex: ['male'] }),
        person('gc', { name: 'Gail', sex: ['female'] }),
      ],
      [
        link('amy', 'ego', 'biological'),
        link('rob', 'ego', 'biological'),
        link('gc', 'ego', 'surrogate', { carrier: true }),
      ],
    );

  test('was carried by them too, and by nobody else', () => {
    const result = plan(parentsAndASurrogate(), {
      relation: 'sibling',
      sharedParentIds: ['amy', 'rob', 'gc'],
      parentKind: 'biological',
      carrier: 'amy',
    });
    expect(result.links).toEqual([
      {
        source: 'gc',
        target: 'added',
        kind: 'surrogate',
        isGestationalCarrier: true,
      },
      {
        source: 'amy',
        target: 'added',
        kind: 'biological',
        isGestationalCarrier: false,
      },
      {
        source: 'rob',
        target: 'added',
        kind: 'biological',
        isGestationalCarrier: false,
      },
    ]);
    expect(
      possibleCarriers(
        parentsAndASurrogate(),
        result,
        'added',
        config.sexAssignedAtBirthAttribute,
      ),
    ).toEqual([]);
  });
});
