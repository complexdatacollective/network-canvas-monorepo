import { describe, expect, test } from 'vitest';

import {
  type AdditionPlan,
  type Family,
  fullSiblingsOf,
  missingDetailsFor,
  partnersOf,
  planAddRelative,
  planRemovePerson,
  primaryParentsOf,
  readFamily,
  siblingsOf,
} from '../model';
import { config, configWithoutGenderIdentity, link, person } from './fixtures';

/** Ego with two parents and a full sibling; the parents are partners. */
function nuclearFamily(): Family {
  return readFamily(
    [
      person('ego', { isEgo: true, gender: ['woman'], sex: ['female'] }),
      person('mum', { name: 'Julie', gender: ['woman'], sex: ['female'] }),
      person('dad', { name: 'Rob', gender: ['man'] }),
      person('sib', { name: 'Sam' }),
      person('other-type-node'),
    ],
    [
      link('mum', 'dad', 'partner', { current: false }),
      link('mum', 'ego', 'biological', { carrier: true }),
      link('dad', 'ego', 'biological'),
      link('mum', 'sib', 'biological'),
      link('dad', 'sib', 'biological'),
    ],
    config,
  );
}

let counter = 0;
const createId = () => `new-${++counter}`;

const plan = (
  family: Family,
  anchorId: string,
  request: Parameters<typeof planAddRelative>[0]['request'],
): AdditionPlan => {
  counter = 0;
  return planAddRelative({
    family,
    anchorId,
    newPersonId: 'added',
    details: { name: 'New' },
    request,
    createId,
    sexVariable: config.sexAssignedAtBirthVariable,
  });
};

describe('readFamily', () => {
  test('reads people, links and ego from the network', () => {
    const family = nuclearFamily();
    expect(family.egoId).toBe('ego');
    expect(family.byId.get('mum')).toMatchObject({
      name: 'Julie',
      genderIdentity: 'woman',
      genderWords: 'feminine',
      sexAssignedAtBirth: 'female',
    });
    expect(family.links).toHaveLength(5);
    expect(
      family.links.find((l) => l.kind === 'partner')?.isCurrentPartner,
    ).toBe(false);
    expect(
      family.links.find((l) => l.source === 'mum' && l.target === 'ego')
        ?.isGestationalCarrier,
    ).toBe(true);
  });

  test('reads any option as the gender identity, and the words it takes', () => {
    const family = readFamily(
      [
        person('a', { gender: ['transWoman'] }),
        person('b', { gender: ['agender'] }),
        person('c', { gender: ['unknown'] }),
        person('d'),
        person('e', { gender: [] }),
      ],
      [],
      config,
    );
    const read = (id: string) => {
      const found = family.byId.get(id);
      return [found?.genderIdentity, found?.genderWords];
    };
    expect(read('a')).toEqual(['transWoman', 'feminine']);
    // Not listed in the stage's terms, so neutral.
    expect(read('b')).toEqual(['agender', 'neutral']);
    expect(read('c')).toEqual(['unknown', 'unknown']);
    // Unanswered.
    expect(read('d')).toEqual([undefined, undefined]);
    expect(read('e')).toEqual([undefined, undefined]);
  });

  test('without gender identity, reads the words from sex assigned at birth and ignores any gender value', () => {
    const family = readFamily(
      [
        person('a', { sex: ['female'], gender: ['man'] }),
        person('b', { sex: ['male'] }),
        person('c', { sex: ['intersex'] }),
        person('d'),
      ],
      [],
      configWithoutGenderIdentity,
    );
    const read = (id: string) => {
      const found = family.byId.get(id);
      return [found?.genderIdentity, found?.genderWords];
    };
    expect(read('a')).toEqual([undefined, 'feminine']);
    expect(read('b')).toEqual([undefined, 'masculine']);
    expect(read('c')).toEqual([undefined, 'neutral']);
    expect(read('d')).toEqual([undefined, 'neutral']);
  });

  test('ignores words given for an option the attribute no longer has', () => {
    // The attribute's options are edited before the stage that owns their words
    // is saved, so the stage can briefly list words for an option that is gone.
    // The entry is never read: it takes someone's answer to match it.
    const family = readFamily(
      [
        person('a', { gender: ['woman'] }),
        person('b', { gender: ['agender'] }),
      ],
      [],
      {
        ...config,
        genderIdentity: {
          variable: 'gender',
          terms: [
            ...(config.genderIdentity?.terms ?? []),
            { value: 'removedOption', words: 'masculine' },
          ],
        },
      },
    );
    expect(family.byId.get('a')?.genderWords).toBe('feminine');
    expect(family.byId.get('b')?.genderWords).toBe('neutral');
  });

  test('ignores links of unknown kinds or to people of another type', () => {
    const family = readFamily(
      [person('a'), person('b')],
      [link('a', 'b', 'cousin'), link('a', 'missing', 'partner')],
      config,
    );
    expect(family.links).toEqual([]);
  });
});

describe('relatives', () => {
  test('derives parents, partners and siblings', () => {
    const family = nuclearFamily();
    expect(primaryParentsOf(family, 'ego').sort()).toEqual(['dad', 'mum']);
    expect(partnersOf(family, 'mum')).toEqual(['dad']);
    expect(siblingsOf(family, 'ego')).toEqual(['sib']);
    expect(fullSiblingsOf(family, 'ego')).toEqual(['sib']);
  });

  test('a half sibling is a sibling but not a full sibling', () => {
    const family = readFamily(
      [person('ego'), person('mum'), person('dad'), person('half')],
      [
        link('mum', 'ego', 'biological'),
        link('dad', 'ego', 'biological'),
        link('mum', 'half', 'biological'),
      ],
      config,
    );
    expect(siblingsOf(family, 'ego')).toEqual(['half']);
    expect(fullSiblingsOf(family, 'ego')).toEqual([]);
  });

  test('donors do not make siblings', () => {
    const family = readFamily(
      [person('a'), person('b'), person('donor')],
      [link('donor', 'a', 'donor'), link('donor', 'b', 'donor')],
      config,
    );
    expect(siblingsOf(family, 'a')).toEqual([]);
  });
});

describe('missingDetailsFor', () => {
  test('lists the built-in details not yet given', () => {
    const family = nuclearFamily();
    expect(missingDetailsFor(family.byId.get('dad')!, [], config)).toEqual([
      'sexAssignedAtBirth',
    ]);
    expect(missingDetailsFor(family.byId.get('sib')!, [], config)).toEqual([
      'genderIdentity',
      'sexAssignedAtBirth',
    ]);
  });

  test('gender identity is asked for only when the stage collects it', () => {
    const family = readFamily(
      [person('a', { sex: ['male'] }), person('b')],
      [],
      configWithoutGenderIdentity,
    );
    expect(
      missingDetailsFor(family.byId.get('a')!, [], configWithoutGenderIdentity),
    ).toEqual([]);
    expect(
      missingDetailsFor(family.byId.get('b')!, [], configWithoutGenderIdentity),
    ).toEqual(['sexAssignedAtBirth']);
    // The same person, with the question configured, is missing it.
    expect(missingDetailsFor(family.byId.get('a')!, [], config)).toEqual([
      'genderIdentity',
    ]);
  });

  test('a name is never required', () => {
    const family = readFamily(
      [person('a', { gender: ['man'], sex: ['male'] })],
      [],
      config,
    );
    expect(missingDetailsFor(family.byId.get('a')!, [], config)).toEqual([]);
  });

  test('includes required researcher fields that are empty', () => {
    const family = readFamily(
      [
        person('a', {
          name: 'A',
          gender: ['man'],
          sex: ['male'],
          age: 40,
          notes: '',
        }),
      ],
      [],
      config,
    );
    expect(
      missingDetailsFor(family.byId.get('a')!, ['age', 'notes'], config),
    ).toEqual([{ variable: 'notes' }]);
  });
});

describe('planAddRelative', () => {
  test('a parent who carried the pregnancy, partnered with an existing parent', () => {
    const family = readFamily(
      [person('ego'), person('dad')],
      [link('dad', 'ego', 'biological')],
      config,
    );
    expect(
      plan(family, 'ego', {
        relation: 'parent',
        parentKind: 'biological',
        carriedPregnancy: true,
        partnerId: 'dad',
        partnershipCurrent: true,
        alsoParentOf: [],
      }).links,
    ).toEqual([
      {
        source: 'added',
        target: 'ego',
        kind: 'biological',
        isGestationalCarrier: true,
      },
      {
        source: 'dad',
        target: 'added',
        kind: 'partner',
        isCurrentPartner: true,
      },
    ]);
  });

  test('a donor is never partnered and never carries', () => {
    const result = plan(nuclearFamily(), 'ego', {
      relation: 'parent',
      parentKind: 'donor',
      carriedPregnancy: true,
      partnerId: 'mum',
      partnershipCurrent: true,
      alsoParentOf: [],
    });
    expect(result.links).toEqual([
      {
        source: 'added',
        target: 'ego',
        kind: 'donor',
        isGestationalCarrier: false,
      },
    ]);
  });

  test('a new parent can also be the parent of the anchor’s siblings', () => {
    const result = plan(nuclearFamily(), 'ego', {
      relation: 'parent',
      parentKind: 'social',
      carriedPregnancy: false,
      partnerId: null,
      partnershipCurrent: true,
      alsoParentOf: ['sib'],
    });
    expect(result.links).toContainEqual({
      source: 'added',
      target: 'sib',
      kind: 'social',
    });
  });

  test('a sibling of someone without parents adds an unnamed couple', () => {
    const family = readFamily([person('ego')], [], config);
    const result = plan(family, 'ego', {
      relation: 'sibling',
      sharedParentIds: [],
      sharesUnshown: 'both',
      parentKind: 'biological',
    });
    expect(result.people.map((p) => p.id)).toEqual(['added', 'new-1', 'new-2']);
    // An egg parent and a sperm parent.
    expect(result.people[1]!.details).toEqual({ sex: ['female'] });
    expect(result.people[2]!.details).toEqual({ sex: ['male'] });
    expect(result.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'new-1', target: 'new-2' }),
        expect.objectContaining({ source: 'new-1', target: 'ego' }),
        expect.objectContaining({ source: 'new-2', target: 'added' }),
      ]),
    );
    expect(result.links).toHaveLength(5);
  });

  test('a half sibling of someone without parents shares one of the two added', () => {
    const family = readFamily([person('ego')], [], config);
    const result = plan(family, 'ego', {
      relation: 'sibling',
      sharedParentIds: [],
      sharesUnshown: 'eggParent',
      parentKind: 'biological',
    });
    expect(result.people.map((p) => p.id)).toEqual(['added', 'new-1', 'new-2']);
    const parentsOf = (id: string) =>
      result.links
        .filter(
          (planned) => planned.kind !== 'partner' && planned.target === id,
        )
        .map((planned) => planned.source);
    expect(parentsOf('ego')).toEqual(['new-1', 'new-2']);
    expect(parentsOf('added')).toEqual(['new-1']);
  });

  test('a sibling can share a parent not yet shown', () => {
    const family = readFamily(
      [person('ego'), person('mum', { sex: ['female'] })],
      [link('mum', 'ego', 'biological')],
      config,
    );
    const result = plan(family, 'ego', {
      relation: 'sibling',
      sharedParentIds: [],
      sharesUnshown: 'other',
      parentKind: 'biological',
    });
    expect(result.people.map((p) => p.id)).toEqual(['added', 'new-1']);
    // Mum, female at birth, gave the egg; the parent added gave the sperm.
    expect(result.people[1]!.details).toEqual({ sex: ['male'] });
    expect(result.links).toEqual([
      { source: 'new-1', target: 'ego', kind: 'biological' },
      {
        source: 'mum',
        target: 'new-1',
        kind: 'partner',
        isCurrentPartner: true,
      },
      { source: 'new-1', target: 'added', kind: 'biological' },
    ]);
  });

  test('a half sibling shares only the chosen parent', () => {
    const result = plan(nuclearFamily(), 'ego', {
      relation: 'sibling',
      sharedParentIds: ['mum'],
      sharesUnshown: 'none',
      parentKind: 'biological',
    });
    expect(result.links).toEqual([
      { source: 'mum', target: 'added', kind: 'biological' },
    ]);
  });

  test('a sibling adopted by the anchor’s biological parents', () => {
    const result = plan(nuclearFamily(), 'ego', {
      relation: 'sibling',
      sharedParentIds: ['mum', 'dad'],
      sharesUnshown: 'none',
      parentKind: 'adoptive',
    });
    expect(result.links).toEqual([
      { source: 'mum', target: 'added', kind: 'adoptive' },
      { source: 'dad', target: 'added', kind: 'adoptive' },
    ]);
  });

  test('a biological child of the parents who adopted the anchor', () => {
    const family = readFamily(
      [person('ego'), person('mum'), person('dad')],
      [link('mum', 'ego', 'adoptive'), link('dad', 'ego', 'adoptive')],
      config,
    );
    const result = plan(family, 'ego', {
      relation: 'sibling',
      sharedParentIds: ['mum', 'dad'],
      sharesUnshown: 'none',
      parentKind: 'biological',
    });
    expect(result.links).toEqual([
      { source: 'mum', target: 'added', kind: 'biological' },
      { source: 'dad', target: 'added', kind: 'biological' },
    ]);
  });

  test('a sibling of someone without parents can be adopted by both added', () => {
    const family = readFamily([person('ego')], [], config);
    const result = plan(family, 'ego', {
      relation: 'sibling',
      sharedParentIds: [],
      sharesUnshown: 'both',
      parentKind: 'adoptive',
    });
    expect(result.links).toEqual(
      expect.arrayContaining([
        { source: 'new-1', target: 'ego', kind: 'biological' },
        { source: 'new-2', target: 'ego', kind: 'biological' },
        { source: 'new-1', target: 'added', kind: 'adoptive' },
        { source: 'new-2', target: 'added', kind: 'adoptive' },
      ]),
    );
  });

  test('the other parent of someone adopted is added as an adoptive parent', () => {
    const family = readFamily(
      [person('ego'), person('mum', { sex: ['female'] })],
      [link('mum', 'ego', 'adoptive')],
      config,
    );
    const result = plan(family, 'ego', {
      relation: 'sibling',
      sharedParentIds: ['mum'],
      sharesUnshown: 'other',
      parentKind: 'adoptive',
    });
    // Not a gamete parent, so their sex at birth does not follow.
    expect(result.people[1]!.details).toEqual({});
    expect(result.links).toEqual([
      { source: 'new-1', target: 'ego', kind: 'adoptive' },
      {
        source: 'mum',
        target: 'new-1',
        kind: 'partner',
        isCurrentPartner: true,
      },
      { source: 'mum', target: 'added', kind: 'adoptive' },
      { source: 'new-1', target: 'added', kind: 'adoptive' },
    ]);
  });

  test('a child with someone not shown yet adds an unnamed partner', () => {
    const result = plan(nuclearFamily(), 'ego', {
      relation: 'child',
      otherParent: 'unknown',
      parentKind: 'biological',
      biologicalParent: 'both',
      carrier: 'anchor',
    });
    expect(result.people.map((p) => p.id)).toEqual(['added', 'new-1']);
    expect(result.links).toEqual([
      {
        source: 'ego',
        target: 'new-1',
        kind: 'partner',
        isCurrentPartner: true,
      },
      {
        source: 'ego',
        target: 'added',
        kind: 'biological',
        isGestationalCarrier: true,
      },
      {
        source: 'new-1',
        target: 'added',
        kind: 'biological',
        isGestationalCarrier: false,
      },
    ]);
  });

  test('a biological child of one partner is a social child of the other', () => {
    const result = plan(nuclearFamily(), 'mum', {
      relation: 'child',
      otherParent: 'dad',
      parentKind: 'biological',
      biologicalParent: 'otherParent',
      carrier: 'anchor',
    });
    expect(result.links).toEqual([
      {
        source: 'mum',
        target: 'added',
        kind: 'social',
        isGestationalCarrier: false,
      },
      {
        source: 'dad',
        target: 'added',
        kind: 'biological',
        isGestationalCarrier: false,
      },
    ]);
  });

  test('an adopted child records no carrier', () => {
    const result = plan(nuclearFamily(), 'mum', {
      relation: 'child',
      otherParent: null,
      parentKind: 'adoptive',
      biologicalParent: 'both',
      carrier: 'anchor',
    });
    expect(result.links).toEqual([
      {
        source: 'mum',
        target: 'added',
        kind: 'adoptive',
        isGestationalCarrier: false,
      },
    ]);
  });

  test('a partner', () => {
    expect(
      plan(nuclearFamily(), 'ego', {
        relation: 'partner',
        partnershipCurrent: false,
      }).links,
    ).toEqual([
      {
        source: 'ego',
        target: 'added',
        kind: 'partner',
        isCurrentPartner: false,
      },
    ]);
  });
});

describe('planRemovePerson', () => {
  test('removes every link touching the person', () => {
    expect(planRemovePerson(nuclearFamily(), 'dad').linkIds.sort()).toEqual(
      ['dad-ego-biological', 'dad-sib-biological', 'mum-dad-partner'].sort(),
    );
  });
});
