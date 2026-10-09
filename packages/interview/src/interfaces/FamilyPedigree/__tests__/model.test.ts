import { describe, expect, test } from 'vitest';

import {
  type AdditionPlan,
  type Family,
  fullSiblingsOf,
  missingDetailsFor,
  nameFingerprint,
  nominationAppliesTo,
  nominationsWithdrawnBy,
  otherParentChoices,
  partnersOf,
  planAddRelative,
  possibleCarriers,
  primaryParentsOf,
  readFamily,
  sexesRuledOut,
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
    sexAttribute: config.sexAssignedAtBirthAttribute,
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
          attribute: 'gender',
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

  test('reads someone who still holds the label the stage saved for them as unnamed', () => {
    const family = readFamily(
      [
        person('saved', { name: 'Sister' }),
        person('typed', { name: 'Sister' }),
      ],
      [],
      config,
      { saved: nameFingerprint('Sister'), gone: nameFingerprint('Father') },
    );
    expect(family.byId.get('saved')).toMatchObject({
      name: undefined,
      hasUnreadableName: false,
    });
    // The same words, typed for someone with no saved label.
    expect(family.byId.get('typed')?.name).toBe('Sister');
    // The attribute itself is untouched.
    expect(family.byId.get('saved')?.attributes.name).toBe('Sister');
  });

  test('re-entry follows the record, not the label text: an encrypted label is still unnamed', () => {
    // An encrypted name is stored as ciphertext, with nothing in it to
    // compare with any label's words.
    const ciphertext = [181, 22, 9, 240, 77, 3, 145, 61, 200, 18];
    const family = readFamily(
      [person('saved', { name: ciphertext })],
      [],
      config,
      { saved: nameFingerprint(ciphertext) },
    );
    expect(family.byId.get('saved')).toMatchObject({
      name: undefined,
      hasUnreadableName: false,
    });
  });

  test('a name written on another stage since the label was saved is kept', () => {
    const family = readFamily(
      [
        // Typed over the label on a later form.
        person('renamed', { name: 'Bea' }),
        // Retyped there as the very words of the label, so encrypted afresh.
        person('reencrypted', { name: [12, 99, 4, 250, 31, 7] }),
        // Encrypted, and never given a label by the stage.
        person('encrypted', { name: [5, 5, 5, 5] }),
      ],
      [],
      config,
      {
        renamed: nameFingerprint('Sister (partner of Tom)'),
        reencrypted: nameFingerprint([181, 22, 9, 240, 77, 3]),
      },
    );
    expect(family.byId.get('renamed')).toMatchObject({
      name: 'Bea',
      hasUnreadableName: false,
    });
    for (const id of ['reencrypted', 'encrypted']) {
      expect(family.byId.get(id)).toMatchObject({
        name: undefined,
        hasUnreadableName: true,
      });
    }
  });
});

describe('readFamily with an attribute named __proto__', () => {
  // `CodebookIdSchema` admits `__proto__`, and a plain object answers a read
  // of it with Object.prototype when it holds no such value of its own.
  const protoConfig = {
    ...config,
    nameAttribute: '__proto__',
    relativesNotRecordedAttribute: 'constructor',
  };

  test('reads a person with no name as unnamed, not as an unreadable name', () => {
    const family = readFamily(
      [person('ego', { isEgo: true })],
      [],
      protoConfig,
    );
    expect(family.byId.get('ego')).toMatchObject({
      name: undefined,
      hasUnreadableName: false,
      relativesNotRecorded: [],
    });
  });

  test('reads a name stored under it', () => {
    const family = readFamily(
      [person('ego', Object.fromEntries([['__proto__', 'Ada']]))],
      [],
      protoConfig,
    );
    expect(family.byId.get('ego')?.name).toBe('Ada');
  });

  test('finds a required field under it missing until it is answered', () => {
    const family = readFamily(
      [
        person('a', { gender: ['man'], sex: ['male'] }),
        person('b', {
          gender: ['man'],
          sex: ['male'],
          ...Object.fromEntries([['__proto__', 40]]),
        }),
      ],
      [],
      config,
    );
    expect(
      missingDetailsFor(family.byId.get('a')!, ['__proto__'], config),
    ).toEqual([{ variable: '__proto__' }]);
    expect(
      missingDetailsFor(family.byId.get('b')!, ['__proto__'], config),
    ).toEqual([]);
  });
});

describe('readFamily with encrypted names', () => {
  const ciphertext = [181, 22, 9, 240, 77, 3, 145, 61, 200, 18];

  test('reads an encrypted name once it is decrypted, and cannot read it before', () => {
    const nodes = [person('bea', { name: ciphertext })];
    expect(readFamily(nodes, [], config).byId.get('bea')).toMatchObject({
      name: undefined,
      hasUnreadableName: true,
    });
    expect(
      readFamily(nodes, [], config, {}, new Map([['bea', 'Bea']])).byId.get(
        'bea',
      ),
    ).toMatchObject({ name: 'Bea', hasUnreadableName: false });
  });

  test('someone holding an encrypted label the stage saved is unnamed, decrypted or not', () => {
    const nodes = [person('sis', { name: ciphertext })];
    const record = { sis: nameFingerprint(ciphertext) };
    for (const decrypted of [
      new Map<string, string>(),
      new Map([['sis', 'Sister']]),
    ]) {
      expect(
        readFamily(nodes, [], config, record, decrypted).byId.get('sis'),
      ).toMatchObject({ name: undefined, hasUnreadableName: false });
    }
  });

  test('a decrypted name of nothing but space is no name', () => {
    expect(
      readFamily(
        [person('blank', { name: ciphertext })],
        [],
        config,
        {},
        new Map([['blank', '  ']]),
      ).byId.get('blank'),
    ).toMatchObject({ name: undefined, hasUnreadableName: false });
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

  test('a shared donor makes siblings, as a genetic parent', () => {
    const family = readFamily(
      [person('a'), person('b'), person('donor')],
      [link('donor', 'a', 'donor'), link('donor', 'b', 'donor')],
      config,
    );
    expect(siblingsOf(family, 'a')).toEqual(['b']);
    // With no primary parent to share, they are not full siblings for the
    // form's defaults.
    expect(fullSiblingsOf(family, 'a')).toEqual([]);
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

  test('a parent who carried siblings is recorded only for those with nobody recorded', () => {
    // A surrogate carried the anchor; Sam, the anchor's sibling, has nobody
    // recorded, and Kim already has a carrier.
    const family = readFamily(
      [
        person('ego'),
        person('surrogate', { sex: ['female'] }),
        person('sam'),
        person('kim'),
        person('kimsCarrier', { sex: ['female'] }),
        person('dad', { sex: ['male'] }),
      ],
      [
        link('surrogate', 'ego', 'surrogate', { carrier: true }),
        link('dad', 'ego', 'biological'),
        link('dad', 'sam', 'biological'),
        link('dad', 'kim', 'biological'),
        link('kimsCarrier', 'kim', 'surrogate', { carrier: true }),
      ],
      config,
    );
    const result = plan(family, 'ego', {
      relation: 'parent',
      parentKind: 'biological',
      carriedPregnancy: true,
      partnerId: null,
      partnershipCurrent: true,
      alsoParentOf: ['sam', 'kim'],
    });
    expect(
      result.links.map((planned) => [
        planned.target,
        planned.isGestationalCarrier,
      ]),
    ).toEqual([
      ['ego', false],
      ['sam', true],
      ['kim', false],
    ]);
  });

  test('a donor is never partnered and never carries', () => {
    const family = readFamily(
      [person('ego', { isEgo: true }), person('mum', { sex: ['female'] })],
      [link('mum', 'ego', 'biological')],
      config,
    );
    const result = plan(family, 'ego', {
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
      isGestationalCarrier: false,
    });
  });

  test('a sibling of someone without parents adds an unnamed couple', () => {
    const family = readFamily([person('ego')], [], config);
    const result = plan(family, 'ego', {
      relation: 'sibling',
      sharedParentIds: [],
      sharesUnshown: 'both',
      parentKind: 'biological',
      carrier: null,
    });
    expect(result.people.map((p) => p.id)).toEqual(['added', 'new-1', 'new-2']);
    // An egg parent and a sperm parent.
    expect(result.people[1]!.details).toEqual({ sex: ['female'] });
    expect(result.people[2]!.details).toEqual({ sex: ['male'] });
    // Their parents, and nothing more: the two added are not recorded as
    // partners, which the participant was never asked.
    expect(result.links).toEqual([
      { source: 'new-1', target: 'ego', kind: 'biological' },
      { source: 'new-2', target: 'ego', kind: 'biological' },
      { source: 'new-1', target: 'added', kind: 'biological' },
      { source: 'new-2', target: 'added', kind: 'biological' },
    ]);
  });

  test('a half sibling of someone without parents shares one of the two added', () => {
    const family = readFamily([person('ego')], [], config);
    const result = plan(family, 'ego', {
      relation: 'sibling',
      sharedParentIds: [],
      sharesUnshown: 'eggParent',
      parentKind: 'biological',
      carrier: null,
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
      carrier: null,
    });
    expect(result.people.map((p) => p.id)).toEqual(['added', 'new-1']);
    // Mum, female at birth, gave the egg; the parent added gave the sperm.
    expect(result.people[1]!.details).toEqual({ sex: ['male'] });
    // Not recorded as mum's partner, which the participant was never asked.
    expect(result.links).toEqual([
      { source: 'new-1', target: 'ego', kind: 'biological' },
      { source: 'new-1', target: 'added', kind: 'biological' },
    ]);
  });

  test('a sibling who does not share the second parent of someone with one is a half sibling', () => {
    const family = readFamily(
      [person('ego'), person('mum', { sex: ['female'] })],
      [link('mum', 'ego', 'biological')],
      config,
    );
    const result = plan(family, 'ego', {
      relation: 'sibling',
      sharedParentIds: ['mum'],
      sharesUnshown: 'none',
      parentKind: 'biological',
      carrier: null,
    });
    // The anchor's second parent is added for the anchor alone, so the two
    // are recorded with different genetic parents.
    expect(result.people.map((p) => p.id)).toEqual(['added', 'new-1']);
    expect(result.people[1]!.details).toEqual({ sex: ['male'] });
    expect(result.links).toEqual([
      { source: 'new-1', target: 'ego', kind: 'biological' },
      { source: 'mum', target: 'added', kind: 'biological' },
    ]);
  });

  test('someone with a parent and a donor is given no other parent for a sibling', () => {
    const family = readFamily(
      [
        person('ego'),
        person('mum', { sex: ['female'] }),
        person('spermDonor', { sex: ['male'] }),
      ],
      [link('mum', 'ego', 'biological'), link('spermDonor', 'ego', 'donor')],
      config,
    );
    for (const sharesUnshown of ['other', 'none'] as const) {
      const result = plan(family, 'ego', {
        relation: 'sibling',
        sharedParentIds: ['mum'],
        sharesUnshown,
        parentKind: 'biological',
        carrier: null,
      });
      // Their genetic parents are all recorded, so nobody stands in for one,
      // and nobody is added as an adoptive parent or a partner.
      expect(result.people.map((p) => p.id)).toEqual(['added']);
      expect(result.links).toEqual([
        { source: 'mum', target: 'added', kind: 'biological' },
      ]);
    }
  });

  test('a half sibling shares only the chosen parent', () => {
    const result = plan(nuclearFamily(), 'ego', {
      relation: 'sibling',
      sharedParentIds: ['mum'],
      sharesUnshown: 'none',
      parentKind: 'biological',
      carrier: null,
    });
    expect(result.links).toEqual([
      { source: 'mum', target: 'added', kind: 'biological' },
    ]);
  });

  describe('who carried a sibling’s pregnancy', () => {
    const parentsOfEgo = () =>
      readFamily(
        [
          person('ego'),
          person('mum', { sex: ['female'] }),
          person('dad', { sex: ['male'] }),
        ],
        [
          link('mum', 'dad', 'partner'),
          link('mum', 'ego', 'biological', { carrier: true }),
          link('dad', 'ego', 'biological'),
        ],
        config,
      );

    test('the parent chosen is recorded as having carried it', () => {
      const family = parentsOfEgo();
      const result = plan(family, 'ego', {
        relation: 'sibling',
        sharedParentIds: ['mum', 'dad'],
        sharesUnshown: 'none',
        parentKind: 'biological',
        carrier: 'mum',
      });
      expect(
        possibleCarriers(
          family,
          result,
          'added',
          config.sexAssignedAtBirthAttribute,
        ),
      ).toEqual(['mum']);
      expect(result.links).toEqual([
        {
          source: 'mum',
          target: 'added',
          kind: 'biological',
          isGestationalCarrier: true,
        },
        { source: 'dad', target: 'added', kind: 'biological' },
      ]);
    });

    test('nobody is recorded for a parent who could not have carried it', () => {
      const result = plan(parentsOfEgo(), 'ego', {
        relation: 'sibling',
        sharedParentIds: ['mum', 'dad'],
        sharesUnshown: 'none',
        parentKind: 'biological',
        carrier: 'dad',
      });
      expect(result.links.some((planned) => planned.isGestationalCarrier)).toBe(
        false,
      );
    });

    test('nobody is recorded for a parent the sibling does not share', () => {
      const result = plan(parentsOfEgo(), 'ego', {
        relation: 'sibling',
        sharedParentIds: ['dad'],
        sharesUnshown: 'none',
        parentKind: 'biological',
        carrier: 'mum',
      });
      expect(result.links).toEqual([
        { source: 'dad', target: 'added', kind: 'biological' },
      ]);
    });

    test('nobody is recorded for a sibling who is not a biological child', () => {
      const result = plan(parentsOfEgo(), 'ego', {
        relation: 'sibling',
        sharedParentIds: ['mum', 'dad'],
        sharesUnshown: 'none',
        parentKind: 'adoptive',
        carrier: 'mum',
      });
      expect(result.links.some((planned) => planned.isGestationalCarrier)).toBe(
        false,
      );
    });

    test('an unnamed parent added for both can have carried it', () => {
      const family = readFamily([person('ego')], [], config);
      const request = {
        relation: 'sibling',
        sharedParentIds: [],
        sharesUnshown: 'both',
        parentKind: 'biological',
        carrier: null,
      } as const;
      // The egg parent could have; the sperm parent, male at birth, not.
      expect(
        possibleCarriers(
          family,
          plan(family, 'ego', request),
          'added',
          config.sexAssignedAtBirthAttribute,
        ),
      ).toEqual(['new-1']);
      const result = plan(family, 'ego', { ...request, carrier: 'new-1' });
      expect(
        result.links.filter((planned) => planned.isGestationalCarrier),
      ).toEqual([
        {
          source: 'new-1',
          target: 'added',
          kind: 'biological',
          isGestationalCarrier: true,
        },
      ]);
    });

    test('the second parent not yet shown can have carried it', () => {
      const family = readFamily(
        [person('ego'), person('dad', { sex: ['male'] })],
        [link('dad', 'ego', 'biological')],
        config,
      );
      const result = plan(family, 'ego', {
        relation: 'sibling',
        sharedParentIds: ['dad'],
        sharesUnshown: 'other',
        parentKind: 'biological',
        carrier: 'new-1',
      });
      expect(
        possibleCarriers(
          family,
          result,
          'added',
          config.sexAssignedAtBirthAttribute,
        ),
      ).toEqual(['new-1']);
      expect(
        result.links.find(
          (planned) => planned.source === 'new-1' && planned.target === 'added',
        )?.isGestationalCarrier,
      ).toBe(true);
    });
  });

  test('a sibling adopted by the anchor’s biological parents', () => {
    const result = plan(nuclearFamily(), 'ego', {
      relation: 'sibling',
      sharedParentIds: ['mum', 'dad'],
      sharesUnshown: 'none',
      parentKind: 'adoptive',
      carrier: null,
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
      carrier: null,
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
      carrier: null,
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
      carrier: null,
    });
    // Not a gamete parent, so their sex at birth does not follow.
    expect(result.people[1]!.details).toEqual({});
    expect(result.links).toEqual([
      { source: 'new-1', target: 'ego', kind: 'adoptive' },
      { source: 'mum', target: 'added', kind: 'adoptive' },
      { source: 'new-1', target: 'added', kind: 'adoptive' },
    ]);
  });

  test('a child with someone not shown yet adds an unnamed parent, not a partner', () => {
    const result = plan(nuclearFamily(), 'ego', {
      relation: 'child',
      otherParent: 'unknown',
      parentKind: 'biological',
      biologicalParent: 'both',
      carrier: 'anchor',
    });
    expect(result.people.map((p) => p.id)).toEqual(['added', 'new-1']);
    // The participant was never asked whether they were partners.
    expect(result.links).toEqual([
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

  test('a child conceived with a donor’s egg or sperm, with no other parent', () => {
    const family = readFamily(
      [person('ego'), person('donor', { sex: ['male'] })],
      [link('donor', 'ego', 'donor')],
      config,
    );
    const result = plan(family, 'donor', {
      relation: 'child',
      otherParent: null,
      parentKind: 'donor',
      biologicalParent: 'both',
      carrier: null,
    });
    expect(result.links).toEqual([
      {
        source: 'donor',
        target: 'added',
        kind: 'donor',
        isGestationalCarrier: false,
      },
    ]);
  });

  test('a donor-conceived child’s other parent not shown yet gave the other gamete and may have carried them', () => {
    const family = readFamily(
      [person('ego'), person('donor', { sex: ['male'] })],
      [link('donor', 'ego', 'donor')],
      config,
    );
    const result = plan(family, 'donor', {
      relation: 'child',
      otherParent: 'unknown',
      parentKind: 'donor',
      biologicalParent: 'both',
      carrier: 'otherParent',
    });
    expect(result.people[1]!.details).toEqual({ sex: ['female'] });
    expect(result.links).toEqual([
      {
        source: 'donor',
        target: 'added',
        kind: 'donor',
        isGestationalCarrier: false,
      },
      {
        source: 'new-1',
        target: 'added',
        kind: 'biological',
        isGestationalCarrier: true,
      },
    ]);
  });

  test('a child carried as a surrogate', () => {
    const result = plan(nuclearFamily(), 'mum', {
      relation: 'child',
      otherParent: 'unknown',
      parentKind: 'surrogate',
      biologicalParent: 'both',
      carrier: null,
    });
    // Not a gamete parent, so the parent added's sex at birth does not
    // follow.
    expect(result.people[1]!.details).toEqual({});
    expect(result.links).toEqual([
      {
        source: 'mum',
        target: 'added',
        kind: 'surrogate',
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

  test('a biological sibling keeps a shared step-parent as a step-parent', () => {
    const family = readFamily(
      [
        person('ego'),
        person('beth', { sex: ['female'] }),
        person('amy', { sex: ['female'] }),
      ],
      [
        link('amy', 'beth', 'partner'),
        link('beth', 'ego', 'social'),
        link('amy', 'ego', 'biological', { carrier: true }),
      ],
      config,
    );
    const result = plan(family, 'ego', {
      relation: 'sibling',
      sharedParentIds: ['beth', 'amy'],
      sharesUnshown: 'none',
      parentKind: 'biological',
      carrier: 'amy',
    });
    // Amy, the participant's biological parent, is the sibling's; Beth,
    // who cannot be a second genetic parent beside her, keeps the kind of
    // parent she is to the participant.
    expect(result.links).toEqual([
      {
        source: 'amy',
        target: 'added',
        kind: 'biological',
        isGestationalCarrier: true,
      },
      { source: 'beth', target: 'added', kind: 'social' },
    ]);
  });

  test('a biological sibling keeps a shared adoptive parent who cannot be genetic as adoptive', () => {
    const family = readFamily(
      [
        person('ego'),
        person('ann', { sex: ['female'] }),
        person('bea', { sex: ['female'] }),
      ],
      [link('ann', 'ego', 'adoptive'), link('bea', 'ego', 'adoptive')],
      config,
    );
    const result = plan(family, 'ego', {
      relation: 'sibling',
      sharedParentIds: ['ann', 'bea'],
      sharesUnshown: 'none',
      parentKind: 'biological',
      carrier: null,
    });
    expect(result.links).toEqual([
      { source: 'ann', target: 'added', kind: 'biological' },
      { source: 'bea', target: 'added', kind: 'adoptive' },
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

describe('nominations limited to one sex at birth', () => {
  test('apply to anyone not recorded as the other sex', () => {
    expect(nominationAppliesTo('female', 'female')).toBe(true);
    expect(nominationAppliesTo('female', 'male')).toBe(false);
    expect(nominationAppliesTo('female', 'intersex')).toBe(true);
    expect(nominationAppliesTo('female', undefined)).toBe(true);
    expect(nominationAppliesTo(undefined, 'male')).toBe(true);
  });

  test('are withdrawn when the person’s sex at birth becomes the other', () => {
    const prompts = [
      { attribute: 'ovarian', onlyForSexAssignedAtBirth: 'female' as const },
      { attribute: 'prostate', onlyForSexAssignedAtBirth: 'male' as const },
      { attribute: 'heart' },
    ];
    const nominated = { ovarian: true, prostate: true, heart: true };
    expect(nominationsWithdrawnBy(prompts, nominated, 'male')).toEqual([
      'ovarian',
    ]);
    expect(nominationsWithdrawnBy(prompts, nominated, 'intersex')).toEqual([]);
    // Someone not nominated, or deselected, has nothing to withdraw.
    expect(nominationsWithdrawnBy(prompts, { ovarian: false }, 'male')).toEqual(
      [],
    );
  });
});

describe('no addition gives anyone more than two genetic parents', () => {
  /**
   * Every person's genetic parents (biological parents and donors) once the
   * plan is added, with their sexes at birth: at most two, at most one
   * recorded female and one recorded male.
   */
  function breaches(family: Family, result: AdditionPlan): string[] {
    const sexOf = new Map<string, unknown>(
      family.people.map((p) => [p.id, p.sexAssignedAtBirth]),
    );
    for (const planned of result.people) {
      const sex = planned.details[config.sexAssignedAtBirthAttribute];
      sexOf.set(planned.id, Array.isArray(sex) ? sex[0] : undefined);
    }
    const links = [...family.links, ...result.links].filter(
      (l) => l.kind === 'biological' || l.kind === 'donor',
    );
    const children = new Set(links.map((l) => l.target));
    return [...children].filter((child) => {
      const sexes = links
        .filter((l) => l.target === child)
        .map((l) => sexOf.get(l.source));
      return (
        sexes.length > 2 ||
        sexes.filter((s) => s === 'female').length > 1 ||
        sexes.filter((s) => s === 'male').length > 1
      );
    });
  }

  test('a sibling of someone with only a donor parent', () => {
    const family = readFamily(
      [person('ego'), person('eggDonor', { sex: ['female'] })],
      [link('eggDonor', 'ego', 'donor')],
      config,
    );
    const result = plan(family, 'ego', {
      relation: 'sibling',
      sharedParentIds: [],
      sharesUnshown: 'both',
      parentKind: 'biological',
      carrier: null,
    });
    expect(breaches(family, result)).toEqual([]);
    // The sperm is still to give, so one unnamed parent gives it; the egg
    // donor already gave the egg, so nobody else is added, and nobody as an
    // adoptive parent.
    expect(result.people.slice(1).map((p) => p.details)).toEqual([
      { sex: ['male'] },
    ]);
    expect(result.links).toEqual([
      { source: 'new-1', target: 'ego', kind: 'biological' },
      { source: 'new-1', target: 'added', kind: 'biological' },
    ]);
  });

  test('a sibling of someone with two donors and no other parent', () => {
    const family = readFamily(
      [
        person('ego'),
        person('eggDonor', { sex: ['female'] }),
        person('spermDonor', { sex: ['male'] }),
      ],
      [link('eggDonor', 'ego', 'donor'), link('spermDonor', 'ego', 'donor')],
      config,
    );
    const result = plan(family, 'ego', {
      relation: 'sibling',
      sharedParentIds: [],
      sharesUnshown: 'both',
      parentKind: 'biological',
      carrier: null,
    });
    expect(breaches(family, result)).toEqual([]);
  });

  test('a sibling sharing the unshown second parent of someone with a parent and a donor', () => {
    const family = readFamily(
      [
        person('ego'),
        person('mum', { sex: ['female'] }),
        person('spermDonor', { sex: ['male'] }),
      ],
      [link('mum', 'ego', 'biological'), link('spermDonor', 'ego', 'donor')],
      config,
    );
    const result = plan(family, 'ego', {
      relation: 'sibling',
      sharedParentIds: ['mum'],
      sharesUnshown: 'other',
      parentKind: 'biological',
      carrier: null,
    });
    expect(breaches(family, result)).toEqual([]);
  });

  test('a new genetic parent is not also made the parent of a sibling who has two', () => {
    const family = readFamily(
      [
        person('ego'),
        person('mum', { sex: ['female'] }),
        person('sib'),
        person('sibDad', { sex: ['male'] }),
      ],
      [
        link('mum', 'ego', 'biological'),
        link('mum', 'sib', 'biological'),
        link('sibDad', 'sib', 'biological'),
      ],
      config,
    );
    const result = planAddRelative({
      family,
      anchorId: 'ego',
      newPersonId: 'added',
      details: { sex: ['male'] },
      request: {
        relation: 'parent',
        parentKind: 'biological',
        carriedPregnancy: false,
        partnerId: null,
        partnershipCurrent: true,
        alsoParentOf: ['sib'],
      },
      createId,
      sexAttribute: config.sexAssignedAtBirthAttribute,
    });
    expect(breaches(family, result)).toEqual([]);
  });

  test('a child of two partners recorded the same sex at birth is the biological child of one', () => {
    const family = readFamily(
      [person('ego', { sex: ['female'] }), person('wife', { sex: ['female'] })],
      [link('ego', 'wife', 'partner')],
      config,
    );
    const result = plan(family, 'ego', {
      relation: 'child',
      otherParent: 'wife',
      parentKind: 'biological',
      biologicalParent: 'both',
      carrier: 'anchor',
    });
    expect(breaches(family, result)).toEqual([]);
  });
});

describe('a new parent of the anchor’s siblings', () => {
  const family = () =>
    readFamily(
      [
        person('ego', { isEgo: true }),
        person('dad', { sex: ['male'] }),
        person('sib'),
      ],
      [link('dad', 'ego', 'biological'), link('dad', 'sib', 'biological')],
      config,
    );

  test('is the same kind of parent to each, with the same record of carrying', () => {
    const result = planAddRelative({
      family: family(),
      anchorId: 'ego',
      newPersonId: 'added',
      details: { sex: ['female'] },
      request: {
        relation: 'parent',
        parentKind: 'surrogate',
        carriedPregnancy: true,
        partnerId: null,
        partnershipCurrent: true,
        alsoParentOf: ['sib'],
      },
      createId,
      sexAttribute: config.sexAssignedAtBirthAttribute,
    });
    expect(result.links).toEqual([
      {
        source: 'added',
        target: 'ego',
        kind: 'surrogate',
        isGestationalCarrier: true,
      },
      {
        source: 'added',
        target: 'sib',
        kind: 'surrogate',
        isGestationalCarrier: true,
      },
    ]);
  });

  test('a biological parent who carried the anchor carried a sibling with no carrier recorded, and not one who has another', () => {
    const withCarrier = readFamily(
      [
        person('ego', { isEgo: true }),
        person('dad', { sex: ['male'] }),
        person('sib'),
        person('sib2'),
        person('surrogate', { sex: ['female'] }),
      ],
      [
        link('dad', 'ego', 'biological'),
        link('dad', 'sib', 'biological'),
        link('dad', 'sib2', 'biological'),
        link('surrogate', 'sib2', 'surrogate', { carrier: true }),
      ],
      config,
    );
    const result = planAddRelative({
      family: withCarrier,
      anchorId: 'ego',
      newPersonId: 'added',
      details: { sex: ['female'] },
      request: {
        relation: 'parent',
        parentKind: 'biological',
        carriedPregnancy: true,
        partnerId: null,
        partnershipCurrent: true,
        alsoParentOf: ['sib', 'sib2'],
      },
      createId,
      sexAttribute: config.sexAssignedAtBirthAttribute,
    });
    expect(result.links).toEqual([
      {
        source: 'added',
        target: 'ego',
        kind: 'biological',
        isGestationalCarrier: true,
      },
      {
        source: 'added',
        target: 'sib',
        kind: 'biological',
        isGestationalCarrier: true,
      },
      {
        source: 'added',
        target: 'sib2',
        kind: 'biological',
        isGestationalCarrier: false,
      },
    ]);
  });
});

describe('fullSiblingsOf', () => {
  test('is only those with exactly the same primary parents', () => {
    const family = readFamily(
      [
        person('ego'),
        person('mum'),
        person('dad'),
        person('fullSib'),
        person('halfSib'),
      ],
      [
        link('mum', 'ego', 'biological'),
        link('mum', 'fullSib', 'biological'),
        link('mum', 'halfSib', 'biological'),
        link('dad', 'halfSib', 'biological'),
      ],
      config,
    );
    // Ego has one parent recorded; a sibling with a second parent cannot be
    // their full sibling, as ego's second parent is not that person.
    expect(fullSiblingsOf(family, 'ego')).toEqual(['fullSib']);
    expect(fullSiblingsOf(family, 'halfSib')).toEqual([]);
  });
});

describe('otherParentChoices', () => {
  test('offers current partners first and assumes the only one', () => {
    const family = readFamily(
      [
        person('kayla'),
        person('father'),
        person('tyler'),
        person('theo'),
        person('theoDad'),
      ],
      [
        link('kayla', 'father', 'partner', { current: false }),
        link('kayla', 'tyler', 'partner'),
        link('kayla', 'theo', 'biological'),
        link('theoDad', 'theo', 'biological'),
      ],
      config,
    );
    expect(otherParentChoices(family, 'kayla')).toEqual({
      choices: ['tyler', 'father', 'theoDad'],
      preferred: 'tyler',
    });
  });

  test('assumes nobody while two current partners could be the parent', () => {
    const family = readFamily(
      [person('kayla'), person('ana'), person('tyler')],
      [link('kayla', 'ana', 'partner'), link('kayla', 'tyler', 'partner')],
      config,
    );
    expect(otherParentChoices(family, 'kayla').preferred).toBeUndefined();
  });

  test('assumes nobody when the only partner is a former one', () => {
    const family = readFamily(
      [person('kayla'), person('father')],
      [link('kayla', 'father', 'partner', { current: false })],
      config,
    );
    expect(otherParentChoices(family, 'kayla')).toEqual({
      choices: ['father'],
      preferred: undefined,
    });
  });
});

describe('sexesRuledOut', () => {
  test('names the other genetic parent whose sex at birth rules a sex out', () => {
    const family = readFamily(
      [
        person('ego', { isEgo: true }),
        person('robin', { sex: ['intersex'] }),
        person('donor', { sex: ['male'] }),
      ],
      [
        link('robin', 'ego', 'biological', { carrier: true }),
        link('donor', 'ego', 'donor'),
      ],
      config,
    );
    expect(sexesRuledOut(family, 'robin')).toEqual([
      {
        sex: 'male',
        rule: 'sameSexGeneticParent',
        childId: 'ego',
        coParentId: 'donor',
      },
      { sex: 'male', rule: 'carried', childId: 'ego' },
    ]);
  });
});
