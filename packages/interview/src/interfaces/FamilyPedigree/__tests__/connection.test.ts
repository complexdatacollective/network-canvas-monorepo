import { describe, expect, test } from 'vitest';

import type { NcEdge, NcNode } from '@codaco/shared-consts';

import {
  areConnected,
  availableParentChoices,
  canConnectPartners,
  connectionUpdates,
  geneticParentsPossible,
  parentChoiceOptions,
  planConnection,
  readFamily,
  sexConflicts,
} from '../model';
import { config, link, person } from './fixtures';

const family = (nodes: NcNode[], edges: NcEdge[]) =>
  readFamily(nodes, edges, config);

const people = ['ego', 'mum', 'dad', 'nan', 'other'].map((id) =>
  person(id, id === 'ego' ? { isEgo: true } : {}),
);
const namedMum = people.map((node) =>
  node._uid === 'mum' ? person('mum', { name: 'Julie' }) : node,
);

describe('connecting two people', () => {
  test('people already linked in any way are connected', () => {
    const f = family(people, [
      link('mum', 'dad', 'partner'),
      link('mum', 'ego', 'social'),
    ]);
    expect(areConnected(f, 'dad', 'mum')).toBe(true);
    expect(areConnected(f, 'ego', 'mum')).toBe(true);
    expect(areConnected(f, 'ego', 'dad')).toBe(false);
  });

  test('partners: not when already partners, or parent and child', () => {
    const f = family(people, [
      link('mum', 'dad', 'partner'),
      link('mum', 'ego', 'biological'),
    ]);
    expect(canConnectPartners(f, 'mum', 'dad')).toBe(false);
    expect(canConnectPartners(f, 'dad', 'mum')).toBe(false);
    expect(canConnectPartners(f, 'ego', 'mum')).toBe(false);
    expect(canConnectPartners(f, 'ego', 'other')).toBe(true);
    expect(canConnectPartners(f, 'ego', 'ego')).toBe(false);
  });

  const kinds = (choices: ReturnType<typeof availableParentChoices>) =>
    choices.map(
      (choice) =>
        `${choice.parentKind}${choice.parentKind !== 'surrogate' && choice.carriedPregnancy ? '+carried' : ''}`,
    );

  test('parents: every kind for two unrelated people', () => {
    expect(
      kinds(availableParentChoices(family(people, []), 'mum', 'ego')),
    ).toEqual([
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

  test('parents: none when already linked, either way round', () => {
    const f = family(people, [
      link('mum', 'ego', 'adoptive'),
      link('mum', 'dad', 'partner'),
    ]);
    expect(availableParentChoices(f, 'mum', 'ego')).toEqual([]);
    expect(availableParentChoices(f, 'ego', 'mum')).toEqual([]);
    expect(availableParentChoices(f, 'dad', 'mum')).toEqual([]);
  });

  test('parents: none that would make someone their own ancestor', () => {
    const f = family(people, [
      link('nan', 'mum', 'biological'),
      link('mum', 'ego', 'biological'),
    ]);
    expect(availableParentChoices(f, 'ego', 'nan')).toEqual([]);
    expect(availableParentChoices(f, 'nan', 'ego')).not.toEqual([]);
  });

  test('parents: at most two genetic parents and one surrogate', () => {
    // Mum is named, so is not a stand-in who gives way to a genetic parent
    // recorded in her place (ruling 25).
    const f = family(namedMum, [
      link('mum', 'ego', 'biological'),
      link('dad', 'ego', 'donor'),
      link('nan', 'ego', 'surrogate', { carrier: true }),
    ]);
    expect(kinds(availableParentChoices(f, 'other', 'ego'))).toEqual([
      'adoptive',
      'social',
    ]);
  });

  test('parents: one person carried the pregnancy, the newest answer winning', () => {
    const f = family(people, [
      link('mum', 'ego', 'biological', { carrier: true }),
    ]);
    expect(kinds(availableParentChoices(f, 'dad', 'ego'))).toEqual([
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

  test('parents: not as having carried the pregnancy when male at birth', () => {
    const f = family(
      [...people, person('father', { sex: ['male'], gender: ['woman'] })],
      [],
    );
    expect(kinds(availableParentChoices(f, 'father', 'ego'))).toEqual([
      'biological',
      'adoptive',
      'social',
      'donor',
    ]);
  });

  test('parents: as having carried the pregnancy when sex at birth is not male', () => {
    for (const sex of ['female', 'intersex', 'unknown', 'preferNotToSay']) {
      const f = family([...people, person('parent', { sex: [sex] })], []);
      expect(kinds(availableParentChoices(f, 'parent', 'ego'))).toContain(
        'biological+carried',
      );
    }
  });

  test('genetic parents: one egg and one sperm', () => {
    expect(geneticParentsPossible(['female', 'male'])).toBe(true);
    expect(geneticParentsPossible(['male', 'male'])).toBe(false);
    expect(geneticParentsPossible(['female', 'female'])).toBe(false);
    expect(geneticParentsPossible(['male', 'intersex'])).toBe(true);
    expect(geneticParentsPossible(['male', undefined])).toBe(true);
    expect(geneticParentsPossible([undefined, undefined, undefined])).toBe(
      false,
    );
  });

  test('parents: not a second genetic parent of the same sex at birth', () => {
    // A trans woman, assigned male at birth, is the biological parent; a
    // man assigned male at birth cannot be the other, so the egg parent is
    // still to be added.
    const f = family(
      [
        ...people,
        person('mother', { sex: ['male'], gender: ['woman'] }),
        person('father', { sex: ['male'], gender: ['man'] }),
        person('donor', { sex: ['female'] }),
      ],
      [link('mother', 'ego', 'biological')],
    );
    // The newest answer wins: the father takes the place of the biological
    // parent recorded with the same sex at birth, who is then the kind of
    // parent the participant says.
    expect(kinds(availableParentChoices(f, 'father', 'ego'))).toEqual([
      'biological',
      'adoptive',
      'social',
      'donor',
    ]);
    expect(
      parentChoiceOptions(f, 'father', 'ego')
        .filter((option) => option.replacesParent !== undefined)
        .map((option) => [option.choice.parentKind, option.replacesParent]),
    ).toEqual([
      ['biological', 'mother'],
      ['donor', 'mother'],
    ]);
    expect(kinds(availableParentChoices(f, 'donor', 'ego'))).toContain('donor');
  });

  test('parents: a donor never gives way to another genetic parent', () => {
    const f = family(
      [
        ...people,
        person('donor', { sex: ['male'] }),
        person('father', { sex: ['male'] }),
      ],
      [link('donor', 'ego', 'donor')],
    );
    expect(kinds(availableParentChoices(f, 'father', 'ego'))).toEqual([
      'adoptive',
      'social',
    ]);
  });

  test('parents: nobody gives way when it is not clear who would', () => {
    // Beside a mother and a father, a parent recorded as neither female nor
    // male at birth could have given either gamete.
    const f = family(
      [
        ...people,
        person('mother', { sex: ['female'] }),
        person('father', { sex: ['male'] }),
        person('parent', { sex: ['intersex'] }),
      ],
      [
        link('mother', 'ego', 'biological', { carrier: true }),
        link('father', 'ego', 'biological'),
      ],
    );
    expect(
      parentChoiceOptions(f, 'parent', 'ego').filter(
        (option) => option.replacesParent !== undefined,
      ),
    ).toEqual([]);
    expect(kinds(availableParentChoices(f, 'parent', 'ego'))).not.toContain(
      'biological',
    );
  });

  test('parents: a genetic parent who replaces another records them as the kind chosen', () => {
    const f = family(
      [
        ...people,
        person('mother', { sex: ['female'] }),
        person('tom', { sex: ['male'] }),
        person('mark', { sex: ['male'] }),
      ],
      [
        link('mother', 'ego', 'biological', { carrier: true }),
        link('tom', 'ego', 'biological'),
      ],
    );
    const updates = connectionUpdates(
      {
        kind: 'parent',
        parentId: 'mark',
        childId: 'ego',
        parentKind: 'biological',
        carriedPregnancy: false,
        replaced: { parentId: 'tom', kind: 'social' },
      },
      f,
    );
    expect(updates).toEqual([
      {
        linkId: f.links.find((each) => each.source === 'tom')?.id,
        kind: 'social',
        isGestationalCarrier: undefined,
      },
    ]);
  });

  test('sexes at birth that contradict a person’s recorded children', () => {
    const f = family(
      [
        ...people,
        person('mother', { sex: ['male'] }),
        person('father', { sex: ['male'] }),
        person('carrier'),
      ],
      [
        link('mother', 'ego', 'biological'),
        link('father', 'other', 'biological'),
        link('carrier', 'other', 'surrogate', { carrier: true }),
      ],
    );
    // Ego's only genetic parent could have been either; nothing is ruled out.
    const sexes = (fam: typeof f, id: string) =>
      (['female', 'male'] as const).filter(
        (sex) => sexConflicts(fam, id, sex).length > 0,
      );
    expect(sexes(f, 'mother')).toEqual([]);
    expect(sexes(f, 'carrier')).toEqual(['male']);
    // The mother is named, so is not a stand-in, whose sex at birth would
    // follow the father's (ruling 25).
    const twoParents = family(
      [
        ...people,
        person('mother', { name: 'Julie', sex: ['female'] }),
        person('father'),
      ],
      [link('mother', 'ego', 'biological'), link('father', 'ego', 'donor')],
    );
    expect(sexes(twoParents, 'father')).toEqual(['female']);
  });

  test('the recorded link', () => {
    const empty = family([], []);
    const sex = config.sexAssignedAtBirthAttribute;
    expect(
      planConnection(
        {
          kind: 'partner',
          firstId: 'a',
          secondId: 'b',
          current: false,
        },
        empty,
        sex,
      ),
    ).toEqual({
      source: 'a',
      target: 'b',
      kind: 'partner',
      isCurrentPartner: false,
    });
    expect(
      planConnection(
        {
          kind: 'parent',
          parentId: 'p',
          childId: 'c',
          parentKind: 'biological',
          carriedPregnancy: true,
        },
        empty,
        sex,
      ),
    ).toMatchObject({ kind: 'biological', isGestationalCarrier: true });
    expect(
      planConnection(
        {
          kind: 'parent',
          parentId: 'p',
          childId: 'c',
          parentKind: 'surrogate',
          carriedPregnancy: true,
        },
        empty,
        sex,
      ),
    ).toEqual({
      source: 'p',
      target: 'c',
      kind: 'surrogate',
      isGestationalCarrier: true,
    });
  });
});
