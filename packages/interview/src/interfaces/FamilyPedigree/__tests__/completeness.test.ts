import { describe, expect, test } from 'vitest';

import type { NcEdge, NcNode } from '@codaco/shared-consts';

import { findCompletenessGaps } from '../completeness';
import { readFamily } from '../model';
import { config, link, person } from './fixtures';

const family = (nodes: NcNode[], edges: NcEdge[]) =>
  readFamily(nodes, edges, config);

const ego = person('ego', { isEgo: true });

describe('findCompletenessGaps', () => {
  test('parents: both biological parents are needed', () => {
    expect(findCompletenessGaps(family([ego], []), 'parents')).toEqual([
      { kind: 'parents', personId: 'ego' },
    ]);
    const oneParent = family(
      [ego, person('mum')],
      [link('mum', 'ego', 'biological')],
    );
    expect(findCompletenessGaps(oneParent, 'parents')).toHaveLength(1);
  });

  test('parents: a gamete donor counts, a carrier or adoptive parent does not', () => {
    const donorConceived = family(
      [ego, person('mum'), person('donor'), person('carrier'), person('adopt')],
      [
        link('mum', 'ego', 'biological'),
        link('donor', 'ego', 'donor'),
        link('carrier', 'ego', 'surrogate'),
        link('adopt', 'ego', 'adoptive'),
      ],
    );
    expect(findCompletenessGaps(donorConceived, 'parents')).toEqual([]);

    const adopted = family(
      [ego, person('a'), person('b')],
      [link('a', 'ego', 'adoptive'), link('b', 'ego', 'adoptive')],
    );
    expect(findCompletenessGaps(adopted, 'parents')).toEqual([
      { kind: 'parents', personId: 'ego' },
    ]);
  });

  const parented = [
    link('mum', 'ego', 'biological'),
    link('dad', 'ego', 'biological'),
  ];

  test('first degree: siblings and children, or an answer about them', () => {
    const nodes = [ego, person('mum'), person('dad')];
    expect(
      findCompletenessGaps(family(nodes, parented), 'firstDegree'),
    ).toEqual([
      { kind: 'siblings', personId: 'ego' },
      { kind: 'children', personId: 'ego' },
    ]);

    const answered = family(
      [
        person('ego', {
          isEgo: true,
          notRecorded: ['noSiblings', 'childrenUnknown'],
        }),
        person('mum'),
        person('dad'),
      ],
      parented,
    );
    expect(findCompletenessGaps(answered, 'firstDegree')).toEqual([]);

    const halfSibling = family(
      [...nodes, person('half'), person('kid')],
      [
        ...parented,
        link('mum', 'half', 'biological'),
        link('ego', 'kid', 'biological'),
      ],
    );
    expect(findCompletenessGaps(halfSibling, 'firstDegree')).toEqual([]);
  });

  test('grandparents: each biological parent needs parents and siblings', () => {
    const f = family(
      [
        person('ego', {
          isEgo: true,
          notRecorded: ['noSiblings', 'noChildren'],
        }),
        person('mum'),
        person('dad', { notRecorded: ['siblingsUnknown'] }),
        person('nan'),
        person('gramps'),
      ],
      [
        ...parented,
        link('nan', 'mum', 'biological'),
        link('gramps', 'mum', 'biological'),
      ],
    );
    expect(findCompletenessGaps(f, 'grandparents')).toEqual([
      { kind: 'siblings', personId: 'mum' },
      { kind: 'parents', personId: 'dad' },
    ]);
  });

  test('second and third degree: nieces, nephews, grandchildren and cousins', () => {
    const f = family(
      [
        person('ego', { isEgo: true }),
        person('mum', { notRecorded: [] }),
        person('dad', { notRecorded: ['noSiblings'] }),
        person('sis'),
        person('kid'),
        person('nan'),
        person('gramps'),
        person('aunt'),
        person('dg1'),
        person('dg2'),
      ],
      [
        ...parented,
        link('mum', 'sis', 'biological'),
        link('dad', 'sis', 'biological'),
        link('ego', 'kid', 'biological'),
        link('nan', 'mum', 'biological'),
        link('gramps', 'mum', 'biological'),
        link('nan', 'aunt', 'biological'),
        link('dg1', 'dad', 'biological'),
        link('dg2', 'dad', 'biological'),
      ],
    );
    expect(findCompletenessGaps(f, 'grandparents')).toEqual([]);
    expect(findCompletenessGaps(f, 'secondDegree')).toEqual([
      { kind: 'children', personId: 'sis' },
      { kind: 'children', personId: 'kid' },
    ]);
    expect(findCompletenessGaps(f, 'thirdDegree')).toEqual([
      { kind: 'children', personId: 'sis' },
      { kind: 'children', personId: 'kid' },
      { kind: 'children', personId: 'aunt' },
    ]);
  });
});
