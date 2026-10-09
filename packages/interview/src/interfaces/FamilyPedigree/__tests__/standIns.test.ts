import { describe, expect, test } from 'vitest';

import {
  entityAttributesProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import {
  type AddRelativeRequest,
  availableParentChoices,
  type Family,
  fullSiblingsOf,
  isStandIn,
  planAddRelative,
  planStandIns,
  readFamily,
  sexesRuledOut,
} from '../model';
import { config, link, person } from './fixtures';

// Ruling 25, the stand-in rule: whenever a person has at least one genetic
// parent recorded (biological or donor), an unnamed stand-in fills the
// missing genetic parent. Adoptive and social parents never get stand-ins,
// and stand-ins are never recorded as anyone's partner.

/** The stand-ins the stage generated, unless a test says otherwise. */
const GENERATED = ['standIn', 'stand-in-1'];

const family = (
  nodes: NcNode[],
  edges: NcEdge[] = [],
  standIns: readonly string[] = GENERATED,
) => readFamily(nodes, edges, config, {}, new Map(), new Set(standIns));

const ids = () => {
  let counter = 0;
  return () => `stand-in-${++counter}`;
};

const changes = (f: Family) =>
  planStandIns(f, ids(), config.sexAssignedAtBirthAttribute);

const plan = (f: Family, anchorId: string, request: AddRelativeRequest) =>
  planAddRelative({
    family: f,
    anchorId,
    newPersonId: 'added',
    details: {},
    request,
    createId: ids(),
    sexAttribute: config.sexAssignedAtBirthAttribute,
  });

const parentRequest = (
  parentKind: 'biological' | 'adoptive' | 'donor',
): AddRelativeRequest => ({
  relation: 'parent',
  parentKind,
  carriedPregnancy: false,
  partnerId: null,
  partnershipCurrent: true,
  alsoParentOf: [],
});

describe('who is a stand-in', () => {
  const nodes = (attributes: Record<string, unknown> = {}) => [
    person('ego', { isEgo: true }),
    person('mum', { sex: ['female'] }),
    person('dad', { sex: ['male'], ...attributes }),
  ];
  const edges = [
    link('mum', 'ego', 'biological'),
    link('dad', 'ego', 'biological'),
  ];

  test('an unnamed biological parent the stage generated, with nothing recorded but their sex at birth', () => {
    expect(isStandIn(family(nodes(), edges, ['dad']), 'dad')).toBe(true);
  });

  test('never an unnamed biological parent the participant added, however little is recorded', () => {
    expect(isStandIn(family(nodes(), edges, []), 'dad')).toBe(false);
  });

  test.each([
    ['named', { name: 'Rob' }],
    ['described', { gender: ['man'] }],
    ['answered about', { nickname: 'Bob' }],
  ])('not someone %s', (_, attributes) => {
    expect(isStandIn(family(nodes(attributes), edges, ['dad']), 'dad')).toBe(
      false,
    );
  });

  test('not someone with a partner, a parent, or who carried a pregnancy', () => {
    expect(
      isStandIn(
        family(nodes(), [...edges, link('dad', 'mum', 'partner')]),
        'dad',
      ),
    ).toBe(false);
    expect(
      isStandIn(
        family(
          [...nodes(), person('gran')],
          [...edges, link('gran', 'dad', 'biological')],
        ),
        'dad',
      ),
    ).toBe(false);
    expect(
      isStandIn(
        family(nodes(), [
          link('mum', 'ego', 'biological', { carrier: true }),
          link('dad', 'ego', 'biological'),
        ]),
        'mum',
      ),
    ).toBe(false);
  });

  test('not an adoptive parent', () => {
    expect(
      isStandIn(
        family(nodes(), [
          link('mum', 'ego', 'biological'),
          link('dad', 'ego', 'adoptive'),
        ]),
        'dad',
      ),
    ).toBe(false);
  });
});

describe('the stand-in rule', () => {
  test('someone with one biological parent is given a stand-in for the other, partnered with nobody', () => {
    const result = changes(
      family(
        [person('ego', { isEgo: true }), person('mum', { sex: ['female'] })],
        [link('mum', 'ego', 'biological')],
      ),
    );
    expect(result.people).toEqual([
      { id: 'stand-in-1', details: { sex: ['male'] } },
    ]);
    expect(result.links).toEqual([
      { source: 'stand-in-1', target: 'ego', kind: 'biological' },
    ]);
  });

  test('someone with one donor is given a stand-in for the other genetic parent', () => {
    const result = changes(
      family(
        [person('ego', { isEgo: true }), person('donor', { sex: ['male'] })],
        [link('donor', 'ego', 'donor')],
      ),
    );
    expect(result.people).toEqual([
      { id: 'stand-in-1', details: { sex: ['female'] } },
    ]);
    expect(result.links).toEqual([
      { source: 'stand-in-1', target: 'ego', kind: 'biological' },
    ]);
  });

  test('adoptive and social parents never get stand-ins', () => {
    const result = changes(
      family(
        [person('ego', { isEgo: true }), person('amy'), person('beth')],
        [link('amy', 'ego', 'adoptive'), link('beth', 'ego', 'social')],
      ),
    );
    expect(result.people).toEqual([]);
    expect(result.links).toEqual([]);
  });

  test('people with the same parents share one stand-in, so full siblings stay full siblings', () => {
    const result = changes(
      family(
        [
          person('ego', { isEgo: true }),
          person('sib'),
          person('mum', { sex: ['female'] }),
        ],
        [link('mum', 'ego', 'biological'), link('mum', 'sib', 'biological')],
      ),
    );
    expect(result.people.map((planned) => planned.id)).toEqual(['stand-in-1']);
    expect(result.links.map((planned) => planned.target)).toEqual([
      'ego',
      'sib',
    ]);
  });

  test('full siblings share one stand-in when a surrogate carried one of them', () => {
    // The surrogate gave neither of them genes and raises neither, so she
    // does not tell them apart.
    const result = changes(
      family(
        [
          person('ego', { isEgo: true }),
          person('sib'),
          person('mum', { sex: ['female'] }),
          person('carrier', { sex: ['female'] }),
        ],
        [
          link('mum', 'ego', 'biological'),
          link('mum', 'sib', 'biological'),
          link('carrier', 'ego', 'surrogate', { carrier: true }),
        ],
      ),
    );
    expect(result.people.map((planned) => planned.id)).toEqual(['stand-in-1']);
    expect(result.links.map((planned) => planned.target)).toEqual([
      'ego',
      'sib',
    ]);
  });

  test('children of one donor raised by the same parent share one stand-in, and children of different donors do not', () => {
    const result = changes(
      family(
        [
          person('ego', { isEgo: true }),
          person('sib'),
          person('halfSib'),
          person('mum', { sex: ['female'] }),
          person('donor', { sex: ['male'] }),
          person('otherDonor', { sex: ['male'] }),
        ],
        [
          link('mum', 'ego', 'social'),
          link('mum', 'sib', 'social'),
          link('mum', 'halfSib', 'social'),
          link('donor', 'ego', 'donor'),
          link('donor', 'sib', 'donor'),
          link('otherDonor', 'halfSib', 'donor'),
        ],
      ),
    );
    expect(result.people.map((planned) => planned.id)).toEqual([
      'stand-in-1',
      'stand-in-2',
    ]);
    expect(
      result.links.map((planned) => [planned.source, planned.target]),
    ).toEqual([
      ['stand-in-1', 'ego'],
      ['stand-in-1', 'sib'],
      ['stand-in-2', 'halfSib'],
    ]);
  });

  test('a stand-in gives way to a genetic parent recorded in their place', () => {
    const result = changes(
      family(
        [
          person('ego', { isEgo: true }),
          person('mum', { sex: ['female'] }),
          person('standIn', { sex: ['male'] }),
          person('dad', { name: 'Rob', sex: ['male'] }),
        ],
        [
          link('mum', 'ego', 'biological'),
          link('standIn', 'ego', 'biological'),
          link('dad', 'ego', 'biological'),
        ],
      ),
    );
    expect(result.removedLinkIds).toEqual(['standIn-ego-biological']);
    expect(result.removedPersonIds).toEqual(['standIn']);
    expect(result.people).toEqual([]);
  });

  test('an unnamed parent the participant added never gives way, and is never removed', () => {
    // Recorded with only a sex at birth, as a stand-in is, but added by the
    // participant: a genetic parent recorded beside them is refused by the
    // genetic limit instead, and nobody is taken away.
    const result = changes(
      family(
        [
          person('ego', { isEgo: true }),
          person('mum', { sex: ['female'] }),
          person('unnamedDad', { sex: ['male'] }),
          person('dad', { name: 'Rob', sex: ['male'] }),
        ],
        [
          link('mum', 'ego', 'biological'),
          link('unnamedDad', 'ego', 'biological'),
          link('dad', 'ego', 'biological'),
        ],
      ),
    );
    expect(result.removedLinkIds).toEqual([]);
    expect(result.removedPersonIds).toEqual([]);
  });

  test('a stand-in something outside the pedigree refers to gives way, but is kept', () => {
    // Another stage joined the stand-in to someone by an edge of its own, so
    // only their place in the family is taken away.
    const result = changes(
      family(
        [
          person('ego', { isEgo: true }),
          person('mum', { sex: ['female'] }),
          person('standIn', { sex: ['male'] }),
          person('dad', { name: 'Rob', sex: ['male'] }),
          person('friend', { name: 'Ali' }),
        ],
        [
          link('mum', 'ego', 'biological'),
          link('standIn', 'ego', 'biological'),
          link('dad', 'ego', 'biological'),
          {
            ...link('standIn', 'friend', 'partner'),
            type: 'knows',
          },
        ],
      ),
    );
    expect(result.removedLinkIds).toEqual(['standIn-ego-biological']);
    expect(result.removedPersonIds).toEqual([]);
  });

  test('a stand-in another pedigree refers to by the same edge type gives way, but is kept', () => {
    // A second family pedigree stage records its relationships in the same
    // edge type, under a kind variable of its own: this pedigree does not
    // read that edge, so it is a reference from outside it.
    const result = changes(
      family(
        [
          person('ego', { isEgo: true }),
          person('mum', { sex: ['female'] }),
          person('standIn', { sex: ['male'] }),
          person('dad', { name: 'Rob', sex: ['male'] }),
          person('friend', { name: 'Ali' }),
        ],
        [
          link('mum', 'ego', 'biological'),
          link('standIn', 'ego', 'biological'),
          link('dad', 'ego', 'biological'),
          {
            ...link('standIn', 'friend', 'biological'),
            [entityAttributesProperty]: { otherKind: ['biological'] },
          },
        ],
      ),
    );
    expect(result.removedLinkIds).toEqual(['standIn-ego-biological']);
    expect(result.removedPersonIds).toEqual([]);
  });

  test('a stand-in gives way as one person: their full sibling takes the new parent too', () => {
    // The participant and their sister share their mother and an unknown
    // father. Recording the participant's father records the father they
    // share, so the sisters stay full sisters.
    const result = changes(
      family(
        [
          person('ego', { isEgo: true }),
          person('sib'),
          person('mum', { sex: ['female'] }),
          person('standIn', { sex: ['male'] }),
          person('dad', { name: 'Rob', sex: ['male'] }),
        ],
        [
          link('mum', 'ego', 'biological'),
          link('standIn', 'ego', 'biological'),
          link('dad', 'ego', 'biological'),
          link('mum', 'sib', 'biological'),
          link('standIn', 'sib', 'biological'),
        ],
      ),
    );
    expect(result.removedLinkIds.toSorted()).toEqual([
      'standIn-ego-biological',
      'standIn-sib-biological',
    ]);
    expect(result.removedPersonIds).toEqual(['standIn']);
    expect(result.links).toEqual([
      { source: 'dad', target: 'sib', kind: 'biological' },
    ]);
    expect(result.people).toEqual([]);
  });

  test('a stand-in gives way as one person: a half sibling who shares only them is not cut off', () => {
    // Jess shares only the participant's unknown father, and has an unknown
    // mother of her own. Mark, recorded as the participant's father, is the
    // father she shares.
    const result = changes(
      family(
        [
          person('ego', { isEgo: true }),
          person('jess', { name: 'Jess' }),
          person('mum', { sex: ['female'] }),
          person('standIn', { sex: ['male'] }),
          person('stand-in-1', { sex: ['female'] }),
          person('mark', { name: 'Mark', sex: ['male'] }),
        ],
        [
          link('mum', 'ego', 'biological'),
          link('standIn', 'ego', 'biological'),
          link('standIn', 'jess', 'biological'),
          link('stand-in-1', 'jess', 'biological'),
          link('mark', 'ego', 'biological'),
        ],
      ),
    );
    expect(result.removedPersonIds).toEqual(['standIn']);
    expect(result.links).toEqual([
      { source: 'mark', target: 'jess', kind: 'biological' },
    ]);
    expect(result.people).toEqual([]);
  });

  test('a stand-in is kept for someone the new parent could not be a genetic parent of', () => {
    // The sibling's other genetic parent is recorded as male, as the new
    // father is, so the stand-in stays theirs.
    const result = changes(
      family(
        [
          person('ego', { isEgo: true }),
          person('sib'),
          person('mum', { sex: ['female'] }),
          person('otherDad', { name: 'Al', sex: ['male'] }),
          person('standIn'),
          person('dad', { name: 'Rob', sex: ['male'] }),
        ],
        [
          link('mum', 'ego', 'biological'),
          link('standIn', 'ego', 'biological'),
          link('otherDad', 'sib', 'biological'),
          link('standIn', 'sib', 'biological'),
          link('dad', 'ego', 'biological'),
        ],
      ),
    );
    expect(result.removedLinkIds).toEqual(['standIn-ego-biological']);
    expect(result.removedPersonIds).toEqual([]);
    expect(result.links).toEqual([]);
  });

  test('the participant’s own unnamed parent outlasts the stand-in when another unnamed parent is added', () => {
    // Gender identity is not asked, so the participant's "Parent 1" has
    // nothing recorded but a sex at birth of "Don't know", as a stand-in may.
    const f = family(
      [
        person('ego', { isEgo: true, sex: ['female'] }),
        person('parent1', { sex: ['unknown'] }),
        person('standIn'),
      ],
      [
        link('parent1', 'ego', 'biological'),
        link('standIn', 'ego', 'biological'),
      ],
    );
    const result = planAddRelative({
      family: f,
      anchorId: 'ego',
      newPersonId: 'added',
      details: { sex: ['unknown'] },
      request: parentRequest('biological'),
      createId: ids(),
      sexAttribute: config.sexAssignedAtBirthAttribute,
    });
    expect(result.removedPersonIds).toEqual(['standIn']);
    expect(result.removedLinkIds).toEqual(['standIn-ego-biological']);
  });

  test('a stand-in’s sex at birth follows the gamete the other genetic parent gave', () => {
    const result = changes(
      family(
        [
          person('ego', { isEgo: true }),
          person('parent', { name: 'Robin', sex: ['male'] }),
          person('standIn', { sex: ['male'] }),
        ],
        [
          link('parent', 'ego', 'biological'),
          link('standIn', 'ego', 'biological'),
        ],
      ),
    );
    expect(result.updatedPeople).toEqual([
      { id: 'standIn', details: { sex: ['female'] } },
    ]);
    expect(result.removedLinkIds).toEqual([]);
  });

  // The stand-in's sex at birth is derived from the other genetic parent's,
  // and is unset when there is no longer exactly one sex it follows from.
  test.each([['intersex'], ['unknown'], ['preferNotToSay'], undefined])(
    'a stand-in’s sex at birth is unset when the other genetic parent’s is %s',
    (sex) => {
      const result = changes(
        family(
          [
            person('ego', { isEgo: true }),
            person('parent', {
              name: 'Robin',
              ...(sex === undefined ? {} : { sex }),
            }),
            person('standIn', { sex: ['male'] }),
          ],
          [
            link('parent', 'ego', 'biological'),
            link('standIn', 'ego', 'biological'),
          ],
        ),
      );
      expect(result.updatedPeople).toEqual([
        { id: 'standIn', details: {}, unset: ['sex'] },
      ]);
    },
  );

  test('a stand-in’s sex at birth is unset when the children it shares disagree on it', () => {
    const result = changes(
      family(
        [
          person('ego', { isEgo: true }),
          person('sib', { name: 'Sam' }),
          person('mum', { name: 'Julie', sex: ['female'] }),
          person('dad', { name: 'Rob', sex: ['male'] }),
          person('standIn', { sex: ['male'] }),
        ],
        [
          link('mum', 'ego', 'biological'),
          link('standIn', 'ego', 'biological'),
          link('dad', 'sib', 'biological'),
          link('standIn', 'sib', 'biological'),
        ],
      ),
    );
    expect(result.updatedPeople).toEqual([
      { id: 'standIn', details: {}, unset: ['sex'] },
    ]);
  });

  test('a stand-in with no sex at birth recorded is left as it is when none follows', () => {
    const result = changes(
      family(
        [
          person('ego', { isEgo: true }),
          person('parent', { name: 'Robin', sex: ['intersex'] }),
          person('standIn'),
        ],
        [
          link('parent', 'ego', 'biological'),
          link('standIn', 'ego', 'biological'),
        ],
      ),
    );
    expect(result.updatedPeople).toEqual([]);
  });

  test('a stand-in does not stop the other genetic parent’s sex at birth from changing', () => {
    const f = family(
      [
        person('ego', { isEgo: true }),
        person('mum', { name: 'Julie', sex: ['female'] }),
        person('standIn', { sex: ['male'] }),
      ],
      [link('mum', 'ego', 'biological'), link('standIn', 'ego', 'biological')],
    );
    expect(sexesRuledOut(f, 'mum')).toEqual([]);
  });

  test('connecting a genetic parent in a stand-in’s place is possible', () => {
    const f = family(
      [
        person('ego', { isEgo: true }),
        person('mum', { sex: ['female'] }),
        person('standIn', { sex: ['male'] }),
        person('dad', { name: 'Rob', sex: ['male'] }),
      ],
      [link('mum', 'ego', 'biological'), link('standIn', 'ego', 'biological')],
    );
    expect(
      availableParentChoices(f, 'dad', 'ego').map(
        (choice) => choice.parentKind,
      ),
    ).toContain('biological');
  });
});

describe('additions keep the stand-in rule', () => {
  test('a new biological parent brings a stand-in for the other', () => {
    const result = plan(
      family([person('ego', { isEgo: true })]),
      'ego',
      parentRequest('biological'),
    );
    expect(result.people.map((planned) => planned.id)).toEqual([
      'added',
      'stand-in-1',
    ]);
    expect(result.links).toEqual([
      {
        source: 'added',
        target: 'ego',
        kind: 'biological',
        isGestationalCarrier: false,
      },
      { source: 'stand-in-1', target: 'ego', kind: 'biological' },
    ]);
  });

  test('a new genetic parent takes a stand-in’s place', () => {
    const f = family(
      [
        person('ego', { isEgo: true }),
        person('mum', { name: 'Julie', sex: ['female'] }),
        person('standIn', { sex: ['male'] }),
      ],
      [link('mum', 'ego', 'biological'), link('standIn', 'ego', 'biological')],
    );
    const result = planAddRelative({
      family: f,
      anchorId: 'ego',
      newPersonId: 'added',
      details: { sex: ['male'] },
      request: parentRequest('biological'),
      createId: ids(),
      sexAttribute: config.sexAssignedAtBirthAttribute,
    });
    expect(result.links).toEqual([
      {
        source: 'added',
        target: 'ego',
        kind: 'biological',
        isGestationalCarrier: false,
      },
    ]);
    expect(result.removedLinkIds).toEqual(['standIn-ego-biological']);
    expect(result.removedPersonIds).toEqual(['standIn']);
  });

  // Ruling 24.
  test('a new adoptive parent brings no stand-in', () => {
    const result = plan(
      family([person('ego', { isEgo: true })]),
      'ego',
      parentRequest('adoptive'),
    );
    expect(result.people.map((planned) => planned.id)).toEqual(['added']);
  });

  test('a new biological child with no other parent is given a stand-in for one', () => {
    const result = plan(
      family([person('ego', { isEgo: true, sex: ['female'] })]),
      'ego',
      {
        relation: 'child',
        otherParent: null,
        parentKind: 'biological',
        biologicalParent: 'both',
        carrier: null,
      },
    );
    expect(result.links).toContainEqual({
      source: 'stand-in-1',
      target: 'added',
      kind: 'biological',
    });
    expect(result.people).toContainEqual({
      id: 'stand-in-1',
      details: { sex: ['male'] },
    });
  });
});

describe('a sibling who does not share a parent', () => {
  // Ruling 25: the new stand-in is connected to the sibling, not the
  // participant.
  test('is given a stand-in of their own, and the participant keeps theirs', () => {
    const f = family(
      [
        person('ego', { isEgo: true }),
        person('mum', { sex: ['female'] }),
        person('standIn', { sex: ['male'] }),
      ],
      [link('mum', 'ego', 'biological'), link('standIn', 'ego', 'biological')],
    );
    const result = plan(f, 'ego', {
      relation: 'sibling',
      sharedParentIds: ['mum'],
      parentKind: 'biological',
      carrier: null,
    });
    expect(result.links).toEqual([
      { source: 'mum', target: 'added', kind: 'biological' },
      { source: 'stand-in-1', target: 'added', kind: 'biological' },
    ]);
    expect(result.removedLinkIds ?? []).toEqual([]);
  });
});

// Ruling 24.
describe('an adopted person with one adoptive parent', () => {
  test('is given no unnamed adoptive parent when a sibling is added', () => {
    const f = family(
      [person('ego', { isEgo: true }), person('amy', { sex: ['female'] })],
      [link('amy', 'ego', 'adoptive')],
    );
    const result = plan(f, 'ego', {
      relation: 'sibling',
      sharedParentIds: ['amy'],
      parentKind: 'adoptive',
      carrier: null,
    });
    expect(result.people.map((planned) => planned.id)).toEqual(['added']);
    expect(result.links).toEqual([
      { source: 'amy', target: 'added', kind: 'adoptive' },
    ]);
  });
});

// Ruling 23.
describe('someone recorded with two donors and no other parents', () => {
  test('is given two unnamed adoptive parents when a sibling is added', () => {
    const f = family(
      [
        person('ego', { isEgo: true }),
        person('eggDonor', { sex: ['female'] }),
        person('spermDonor', { sex: ['male'] }),
      ],
      [link('eggDonor', 'ego', 'donor'), link('spermDonor', 'ego', 'donor')],
    );
    const result = plan(f, 'ego', {
      relation: 'sibling',
      sharedParentIds: [],
      parentKind: 'biological',
      carrier: null,
    });
    expect(
      result.links
        .filter((planned) => planned.target === 'ego')
        .map((planned) => planned.kind),
    ).toEqual(['adoptive', 'adoptive']);
  });
});

// Ruling 22.
describe('removing a parent who tells half siblings apart', () => {
  test('leaves a stand-in in their place, so the siblings stay half siblings', () => {
    // Dad B was removed from a family in which Ego and Sam shared Mum and
    // had different fathers.
    const after = family(
      [
        person('ego', { isEgo: true }),
        person('sam'),
        person('mum', { sex: ['female'] }),
        person('dadA', { name: 'Al', sex: ['male'] }),
      ],
      [
        link('mum', 'ego', 'biological'),
        link('dadA', 'ego', 'biological'),
        link('mum', 'sam', 'biological'),
      ],
    );
    const result = changes(after);
    expect(result.links).toEqual([
      { source: 'stand-in-1', target: 'sam', kind: 'biological' },
    ]);
    const refilled = family(
      [
        person('ego', { isEgo: true }),
        person('sam'),
        person('mum', { sex: ['female'] }),
        person('dadA', { name: 'Al', sex: ['male'] }),
        person('stand-in-1', { sex: ['male'] }),
      ],
      [
        link('mum', 'ego', 'biological'),
        link('dadA', 'ego', 'biological'),
        link('mum', 'sam', 'biological'),
        link('stand-in-1', 'sam', 'biological'),
      ],
    );
    expect(fullSiblingsOf(refilled, 'ego')).toEqual([]);
  });
});
