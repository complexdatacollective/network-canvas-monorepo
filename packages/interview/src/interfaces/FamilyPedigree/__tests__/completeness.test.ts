import { describe, expect, test } from 'vitest';

import type { NcEdge, NcNode } from '@codaco/shared-consts';

import { evaluateCompleteness } from '../completeness';
import { readFamily } from '../model';
import { config, link, person } from './fixtures';

const family = (nodes: NcNode[], edges: NcEdge[]) =>
  readFamily(nodes, edges, config);

const ego = person('ego', { isEgo: true });
const noneMissing = () => false;

describe('evaluateCompleteness', () => {
  test('parents: both biological parents are needed', () => {
    expect(
      evaluateCompleteness(family([ego], []), 'parents', noneMissing).items,
    ).toEqual([{ kind: 'parents', personId: 'ego', missing: 2 }]);
    const oneParent = family(
      [ego, person('mum')],
      [link('mum', 'ego', 'biological')],
    );
    expect(
      evaluateCompleteness(oneParent, 'parents', noneMissing).items,
    ).toHaveLength(1);
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
    expect(
      evaluateCompleteness(donorConceived, 'parents', noneMissing).items,
    ).toEqual([]);

    const adopted = family(
      [ego, person('a'), person('b')],
      [link('a', 'ego', 'adoptive'), link('b', 'ego', 'adoptive')],
    );
    expect(evaluateCompleteness(adopted, 'parents', noneMissing).items).toEqual(
      [{ kind: 'parents', personId: 'ego', missing: 2 }],
    );
  });

  const parented = [
    link('mum', 'ego', 'biological'),
    link('dad', 'ego', 'biological'),
  ];

  test('first degree: siblings and children, or an answer about them', () => {
    const nodes = [ego, person('mum'), person('dad')];
    expect(
      evaluateCompleteness(family(nodes, parented), 'firstDegree', noneMissing)
        .items,
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
    expect(
      evaluateCompleteness(answered, 'firstDegree', noneMissing).items,
    ).toEqual([]);

    const halfSibling = family(
      [...nodes, person('half'), person('kid')],
      [
        ...parented,
        link('mum', 'half', 'biological'),
        link('ego', 'kid', 'biological'),
      ],
    );
    expect(
      evaluateCompleteness(halfSibling, 'firstDegree', noneMissing).items,
    ).toEqual([]);
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
    expect(evaluateCompleteness(f, 'grandparents', noneMissing).items).toEqual([
      { kind: 'siblings', personId: 'mum' },
      { kind: 'parents', personId: 'dad', missing: 2 },
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
    expect(evaluateCompleteness(f, 'grandparents', noneMissing).items).toEqual(
      [],
    );
    expect(evaluateCompleteness(f, 'secondDegree', noneMissing).items).toEqual([
      { kind: 'children', personId: 'sis' },
      { kind: 'children', personId: 'kid' },
    ]);
    expect(evaluateCompleteness(f, 'thirdDegree', noneMissing).items).toEqual([
      { kind: 'children', personId: 'sis' },
      { kind: 'children', personId: 'kid' },
      { kind: 'children', personId: 'aunt' },
    ]);
  });

  test('progress counts parents not yet added, so adding one never lowers it', () => {
    const empty = evaluateCompleteness(
      family([ego], []),
      'grandparents',
      noneMissing,
    );
    // Ego: 2 parents + siblings + children; each parent: 2 parents +
    // siblings; and details for ego and every parent and grandparent.
    expect(empty).toMatchObject({ done: 1, total: 17 });
    const oneParent = evaluateCompleteness(
      family([ego, person('mum')], [link('mum', 'ego', 'biological')]),
      'grandparents',
      noneMissing,
    );
    expect(oneParent).toMatchObject({ done: 3, total: 17 });
    expect(oneParent.items).toContainEqual({
      kind: 'parents',
      personId: 'ego',
      missing: 1,
    });
  });

  test('records who is asked about their siblings and children', () => {
    const { asked } = evaluateCompleteness(
      family([ego, person('mum'), person('dad')], parented),
      'grandparents',
      noneMissing,
    );
    expect([...asked].sort()).toEqual([
      'children:ego',
      'siblings:dad',
      'siblings:ego',
      'siblings:mum',
    ]);
  });

  test('people whose required details are missing are listed, the participant first', () => {
    const f = family(
      [person('mum', { name: 'Julie' }), ego, person('dad')],
      parented,
    );
    const { items } = evaluateCompleteness(f, 'parents', (p) => p.id !== 'mum');
    expect(items).toEqual([
      { kind: 'details', personId: 'ego' },
      { kind: 'details', personId: 'dad' },
    ]);
  });
});
