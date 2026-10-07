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
import { labelEveryone } from '../../FamilyPedigree/generatedLabels';
import { readFamily } from '../../FamilyPedigree/model';
import { participantsFamily, readParticipantsFamily } from '../membership';

const intl = resolveInterviewIntl();

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

describe('labels after the Family Pedigree', () => {
  it('shows the participant as "You" and everyone else by the name saved for them', () => {
    // The Family Pedigree saves a label as the name of anyone left unnamed.
    const saved = person('dad', { name: 'Father', sex: ['male'] });
    const labels = labelEveryone(
      readParticipantsFamily([ego, mum, saved], familyLinks, labelConfig),
      'gendered',
      intl,
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
    );
    expect(labels.get('dad')).toBe('Father');
    const gamete = labelEveryone(
      readParticipantsFamily(family, familyLinks, labelConfig),
      'gamete',
      intl,
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
    );
    expect(unlocked.get('dad')).toBe('David');
  });
});
