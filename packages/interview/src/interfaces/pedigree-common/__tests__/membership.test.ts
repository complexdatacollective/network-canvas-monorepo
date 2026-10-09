import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
} from '@codaco/shared-consts';

import { resolveInterviewIntl } from '../../../i18n/resolveIntl';
import {
  config,
  configWithoutGenderIdentity as labelConfig,
  encryptedPerson,
  link,
  person,
} from '../../FamilyPedigree/__tests__/fixtures';
import { pedigreeWordsIn } from '../../FamilyPedigree/__tests__/pedigreeWords';
import { evaluateCompleteness } from '../../FamilyPedigree/completeness';
import {
  generateLabels,
  labelEveryone,
  labelWrites,
} from '../../FamilyPedigree/generatedLabels';
import { readFamily } from '../../FamilyPedigree/model';
import {
  participantsFamily,
  peopleCutOff,
  planRemovePerson,
  readParticipantsFamily,
} from '../membership';

const intl = resolveInterviewIntl();
const words = pedigreeWordsIn();

const ego = person('ego', { isEgo: true, sex: ['female'] });
const mum = person('mum', { name: 'Rose', sex: ['female'] });
const dad = person('dad', { sex: ['male'] });
const family = [ego, mum, dad];
const familyLinks = [
  link('mum', 'dad', 'partner'),
  link('mum', 'ego', 'biological'),
  link('dad', 'ego', 'biological'),
];

/** A tie of another type between the participant and someone else, as a
 * sociogram might draw. */
const friendship = (from: string, to: string): NcEdge => ({
  [entityPrimaryKeyProperty]: `${from}-${to}-friend`,
  type: 'friendship',
  from,
  to,
  [entityAttributesProperty]: {},
});

describe('participantsFamily', () => {
  it('keeps the participant and everyone connected to them through family relationships', () => {
    const result = readParticipantsFamily(family, familyLinks, config);
    expect(result.people.map((p) => p.id)).toEqual(['ego', 'mum', 'dad']);
    expect(result.links).toHaveLength(3);
    expect(result.egoId).toBe('ego');
  });

  it('leaves out people of the same type who are not family, even when tied to the participant another way', () => {
    const colleague = person('colleague', { name: 'Sam' });
    const result = readParticipantsFamily(
      [...family, colleague],
      [...familyLinks, friendship('ego', 'colleague')],
      config,
    );
    expect(result.byId.has('colleague')).toBe(false);
    expect(result.people.map((p) => p.id)).toEqual(['ego', 'mum', 'dad']);
  });

  it('leaves out family relationships among people unconnected to the participant', () => {
    const result = readParticipantsFamily(
      [...family, person('x'), person('y')],
      [...familyLinks, link('x', 'y', 'partner')],
      config,
    );
    expect(result.byId.has('x')).toBe(false);
    expect(result.byId.has('y')).toBe(false);
    expect(result.links.some((l) => l.source === 'x')).toBe(false);
  });

  it('follows every kind of relationship, however indirect: ended partnerships, donors, surrogates', () => {
    const result = readParticipantsFamily(
      [
        ...family,
        person('ex'),
        person('donor'),
        person('surrogate'),
        person('child'),
        person('exChild'),
      ],
      [
        ...familyLinks,
        link('ego', 'ex', 'partner', { current: false }),
        link('ex', 'exChild', 'biological'),
        link('ego', 'child', 'biological'),
        link('donor', 'child', 'donor'),
        link('surrogate', 'child', 'surrogate', { carrier: true }),
      ],
      config,
    );
    for (const id of ['ex', 'exChild', 'donor', 'surrogate', 'child']) {
      expect(result.byId.has(id)).toBe(true);
    }
  });

  it('is empty without a participant', () => {
    const result = readParticipantsFamily([mum, dad], familyLinks, config);
    expect(result.people).toEqual([]);
    expect(result.egoId).toBeUndefined();
  });

  it('marks only the participant as them', () => {
    const stray = person('stray', { isEgo: true, name: 'Ann' });
    const result = participantsFamily(
      readFamily(
        [...family, stray],
        [...familyLinks, link('mum', 'stray', 'biological')],
        config,
      ),
    );
    expect(result.byId.get('stray')?.isEgo).toBe(false);
    expect(result.byId.get('ego')?.isEgo).toBe(true);
  });
});

/** The participant's family as the Family Pedigree reads it. */
const familyOf = (
  nodes: Parameters<typeof readFamily>[0],
  edges: Parameters<typeof readFamily>[1],
) => participantsFamily(readFamily(nodes, edges, config));

describe('the Family Pedigree and people who are not family', () => {
  // A colleague of the same type, added by a later stage and left unnamed.
  const colleague = person('colleague');
  const nodes = [...family, colleague];
  const edges = [...familyLinks, friendship('ego', 'colleague')];

  it('gives no label to someone who is not family, and writes none as their name', () => {
    const drawn = familyOf(nodes, edges);
    const labels = generateLabels(drawn, 'gendered', intl, words);
    expect(labels.has('colleague')).toBe(false);
    const { toWrite } = labelWrites(drawn, labels, 'name', new Map());
    expect(toWrite.has('colleague')).toBe(false);
    expect(toWrite.has('dad')).toBe(true);
  });

  it('asks nothing about someone who is not family to complete the family', () => {
    // Everyone is missing a detail, so everyone drawn is listed for it.
    const progress = evaluateCompleteness(
      familyOf(nodes, edges),
      'parents',
      () => true,
    );
    const listed = progress.items.map((item) => item.personId);
    expect(listed).toContain('dad');
    expect(listed).not.toContain('colleague');
  });
});

describe('peopleCutOff', () => {
  // The participant's mother's mother, connected to them only through her.
  const grandma = person('grandma', { sex: ['female'] });
  const withGrandma = () =>
    familyOf(
      [...family, grandma],
      [...familyLinks, link('grandma', 'mum', 'biological')],
    );

  it('cuts nobody off when the people a link joins stay connected another way', () => {
    // The participant's parents stay connected through the participant.
    expect(
      peopleCutOff(withGrandma(), { linkIds: ['mum-dad-partner'] }),
    ).toEqual([]);
    // Their mother stays connected through her partnership with their father.
    expect(
      peopleCutOff(withGrandma(), { linkIds: ['mum-ego-biological'] }),
    ).toEqual([]);
  });

  it('names everyone a link is the only connection to', () => {
    const motherOnly = familyOf(
      [ego, mum, grandma],
      [link('mum', 'ego', 'biological'), link('grandma', 'mum', 'biological')],
    );
    expect(
      peopleCutOff(motherOnly, { linkIds: ['mum-ego-biological'] }).sort(),
    ).toEqual(['grandma', 'mum']);
  });

  it('names everyone connected to the participant only through a person, but not that person', () => {
    expect(peopleCutOff(withGrandma(), { personId: 'mum' })).toEqual([
      'grandma',
    ]);
    expect(peopleCutOff(withGrandma(), { personId: 'dad' })).toEqual([]);
  });

  it('keeps a sibling who shares both unnamed parents when one of them is removed', () => {
    // Adding a sibling to someone without parents adds an egg parent and a
    // sperm parent for both to hang from.
    const shared = familyOf(
      [ego, person('egg'), person('sperm'), person('sib')],
      [
        link('egg', 'sperm', 'partner'),
        link('egg', 'ego', 'biological'),
        link('sperm', 'ego', 'biological'),
        link('egg', 'sib', 'biological'),
        link('sperm', 'sib', 'biological'),
      ],
    );
    expect(peopleCutOff(shared, { personId: 'egg' })).toEqual([]);

    const halfSibling = familyOf(
      [ego, person('egg'), person('sperm'), person('sib')],
      [
        link('egg', 'sperm', 'partner'),
        link('egg', 'ego', 'biological'),
        link('sperm', 'ego', 'biological'),
        link('egg', 'sib', 'biological'),
      ],
    );
    expect(peopleCutOff(halfSibling, { personId: 'egg' })).toEqual(['sib']);
  });
});

describe('planRemovePerson', () => {
  it('removes every link touching the person', () => {
    const plan = planRemovePerson(familyOf(family, familyLinks), 'dad');
    expect(plan.cutOffIds).toEqual([]);
    expect(plan.linkIds.sort()).toEqual(
      ['dad-ego-biological', 'mum-dad-partner'].sort(),
    );
  });

  it('removes, with them, everyone connected to the participant only through them, and every link touching those people', () => {
    const plan = planRemovePerson(
      familyOf(
        [...family, person('grandma'), person('grandpa'), person('aunt')],
        [
          ...familyLinks,
          link('grandma', 'grandpa', 'partner'),
          link('grandma', 'mum', 'biological'),
          link('grandpa', 'mum', 'biological'),
          link('grandma', 'aunt', 'biological'),
          link('grandpa', 'aunt', 'biological'),
        ],
      ),
      'mum',
    );
    expect(plan.cutOffIds.sort()).toEqual(['aunt', 'grandma', 'grandpa']);
    expect(plan.linkIds.sort()).toEqual(
      [
        'mum-dad-partner',
        'mum-ego-biological',
        'grandma-grandpa-partner',
        'grandma-mum-biological',
        'grandpa-mum-biological',
        'grandma-aunt-biological',
        'grandpa-aunt-biological',
      ].sort(),
    );
  });
});

describe('labels after the Family Pedigree', () => {
  it('shows the participant as "You" and everyone else by the name saved for them', () => {
    // The Family Pedigree saves a label as the name of anyone left unnamed.
    const saved = person('dad', { name: 'Father', sex: ['male'] });
    const labels = labelEveryone(
      readParticipantsFamily([ego, mum, saved], familyLinks, labelConfig),
      'gendered',
      intl,
      words,
    );
    expect(labels.get('ego')).toBe('You');
    expect(labels.get('mum')).toBe('Rose');
    expect(labels.get('dad')).toBe('Father');
  });

  it('describes someone still without a name by how they are related, in the framing’s words', () => {
    const labels = labelEveryone(
      readParticipantsFamily(family, familyLinks, labelConfig),
      'gendered',
      intl,
      words,
    );
    expect(labels.get('dad')).toBe('Father');
    const gamete = labelEveryone(
      readParticipantsFamily(family, familyLinks, labelConfig),
      'gamete',
      intl,
      words,
    );
    expect(gamete.get('dad')).toBe('Sperm parent');
  });

  it('shows someone whose name is encrypted by it once decrypted, and by a kinship label until then', async () => {
    const encryptedDad = await encryptedPerson('dad', 'David', 'secret', {
      sex: ['male'],
    });
    const nodes = [ego, mum, encryptedDad];
    const locked = labelEveryone(
      readParticipantsFamily(nodes, familyLinks, labelConfig),
      'gendered',
      intl,
      words,
    );
    expect(locked.get('dad')).toBe('Father');
    const unlocked = labelEveryone(
      readParticipantsFamily(
        nodes,
        familyLinks,
        labelConfig,
        new Map([['dad', 'David']]),
      ),
      'gendered',
      intl,
      words,
    );
    expect(unlocked.get('dad')).toBe('David');
  });
});
