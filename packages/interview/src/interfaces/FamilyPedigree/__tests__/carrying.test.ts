import { describe, expect, test } from 'vitest';

import type { NcEdge, NcNode } from '@codaco/shared-consts';

import {
  type AddRelativeRequest,
  availableParentChoices,
  type Family,
  parentChoiceOptions,
  planAddRelative,
  planConnection,
  possibleCarriers,
  readFamily,
} from '../model';
import { config, link, person } from './fixtures';

// Ruling 19: "carried the pregnancy" is a yes/no flag on any parent link —
// biological, adoptive, social or donor — and a surrogate always carried.
// A child has at most one carrier.

const family = (nodes: NcNode[], edges: NcEdge[] = []) =>
  readFamily(nodes, edges, config);

const label = (choice: { parentKind: string; carriedPregnancy: boolean }) =>
  `${choice.parentKind}${choice.carriedPregnancy && choice.parentKind !== 'surrogate' ? '+carried' : ''}`;

const plan = (f: Family, anchorId: string, request: AddRelativeRequest) => {
  let counter = 0;
  return planAddRelative({
    family: f,
    anchorId,
    newPersonId: 'added',
    details: {},
    request,
    createId: () => `new-${++counter}`,
    sexAttribute: config.sexAssignedAtBirthAttribute,
  });
};

describe('connecting a parent who carried the pregnancy', () => {
  test('any kind of parent but a surrogate is offered with and without carrying', () => {
    const f = family([person('ego', { isEgo: true }), person('amy')]);
    expect(availableParentChoices(f, 'amy', 'ego').map(label)).toEqual([
      'biological',
      'biological+carried',
      'adoptive',
      'adoptive+carried',
      'social',
      'social+carried',
      'donor',
      'donor+carried',
      'surrogate',
    ]);
  });

  test('nobody recorded male at birth is offered as having carried', () => {
    const f = family([
      person('ego', { isEgo: true }),
      person('rob', { sex: ['male'] }),
    ]);
    expect(availableParentChoices(f, 'rob', 'ego').map(label)).toEqual([
      'biological',
      'adoptive',
      'social',
      'donor',
    ]);
  });

  test('with a carrier recorded, every choice that carries is unavailable, naming them', () => {
    const f = family(
      [person('ego', { isEgo: true }), person('mum'), person('amy')],
      [link('mum', 'ego', 'biological', { carrier: true })],
    );
    expect(availableParentChoices(f, 'amy', 'ego').map(label)).toEqual([
      'biological',
      'adoptive',
      'social',
      'donor',
    ]);
    expect(
      parentChoiceOptions(f, 'amy', 'ego').map((option) => [
        label(option.choice),
        option.unavailable,
      ]),
    ).toEqual([
      ['biological', undefined],
      ['biological+carried', { rule: 'carrierRecorded', carrierId: 'mum' }],
      ['adoptive', undefined],
      ['adoptive+carried', { rule: 'carrierRecorded', carrierId: 'mum' }],
      ['social', undefined],
      ['social+carried', { rule: 'carrierRecorded', carrierId: 'mum' }],
      ['donor', undefined],
      ['donor+carried', { rule: 'carrierRecorded', carrierId: 'mum' }],
      ['surrogate', { rule: 'carrierRecorded', carrierId: 'mum' }],
    ]);
  });

  test('an adoptive parent or a donor who carried is recorded as having carried', () => {
    expect(
      planConnection({
        kind: 'parent',
        parentId: 'amy',
        childId: 'ego',
        parentKind: 'adoptive',
        carriedPregnancy: true,
      }).isGestationalCarrier,
    ).toBe(true);
    expect(
      planConnection({
        kind: 'parent',
        parentId: 'amy',
        childId: 'ego',
        parentKind: 'donor',
        carriedPregnancy: true,
      }).isGestationalCarrier,
    ).toBe(true);
  });
});

describe('adding a parent who carried the pregnancy', () => {
  test.each(['adoptive', 'social', 'donor'] as const)(
    'a %s parent who carried is recorded as having carried',
    (parentKind) => {
      const f = family([person('ego', { isEgo: true })]);
      const result = plan(f, 'ego', {
        relation: 'parent',
        parentKind,
        carriedPregnancy: true,
        partnerId: null,
        partnershipCurrent: true,
        alsoParentOf: [],
      });
      expect(result.links[0]).toMatchObject({
        kind: parentKind,
        isGestationalCarrier: true,
      });
    },
  );
});

describe('adding a child someone carried', () => {
  test('the social parent of a biological child may have carried them', () => {
    // A couple: Jo gave the egg, Amy carried the pregnancy.
    const f = family(
      [
        person('jo', { isEgo: true, sex: ['female'] }),
        person('amy', { sex: ['female'] }),
      ],
      [link('jo', 'amy', 'partner')],
    );
    const result = plan(f, 'jo', {
      relation: 'child',
      otherParent: 'amy',
      parentKind: 'biological',
      biologicalParent: 'anchor',
      carrier: 'otherParent',
    });
    expect(
      result.links
        .filter(
          (planned) => planned.source === 'jo' || planned.source === 'amy',
        )
        .map((planned) => [
          planned.source,
          planned.kind,
          planned.isGestationalCarrier,
        ]),
    ).toEqual([
      ['jo', 'biological', false],
      ['amy', 'social', true],
    ]);
  });

  test('a donor who carried the child is a traditional surrogate', () => {
    const f = family([person('ego', { isEgo: true, sex: ['female'] })]);
    const result = plan(f, 'ego', {
      relation: 'child',
      otherParent: 'unknown',
      parentKind: 'donor',
      biologicalParent: 'both',
      carrier: 'anchor',
    });
    expect(result.links[0]).toMatchObject({
      source: 'ego',
      kind: 'donor',
      isGestationalCarrier: true,
    });
  });

  test('a genetic link kept to the limit as a social one keeps its carrying', () => {
    // Ego's two genetic parents are recorded, so a third biological parent
    // is recorded as a social parent, who may still have carried them.
    const f = family(
      [
        person('ego', { isEgo: true }),
        person('mum', { name: 'Julie', sex: ['female'] }),
        person('donor', { sex: ['male'] }),
      ],
      [link('mum', 'ego', 'biological'), link('donor', 'ego', 'donor')],
    );
    const result = plan(f, 'ego', {
      relation: 'parent',
      parentKind: 'biological',
      carriedPregnancy: true,
      partnerId: null,
      partnershipCurrent: true,
      alsoParentOf: [],
    });
    expect(result.links[0]).toMatchObject({
      kind: 'social',
      isGestationalCarrier: true,
    });
  });
});

describe('who may have carried a sibling', () => {
  test('the adoptive parents a sibling is planned to have may have', () => {
    const f = family(
      [
        person('ego', { isEgo: true }),
        person('amy', { sex: ['female'] }),
        person('rob', { sex: ['male'] }),
      ],
      [link('amy', 'ego', 'adoptive'), link('rob', 'ego', 'adoptive')],
    );
    const planned = plan(f, 'ego', {
      relation: 'sibling',
      sharedParentIds: ['amy', 'rob'],
      sharesUnshown: 'none',
      parentKind: 'adoptive',
      carrier: null,
    });
    expect(
      possibleCarriers(f, planned, 'added', config.sexAssignedAtBirthAttribute),
    ).toEqual(['amy']);
  });
});
