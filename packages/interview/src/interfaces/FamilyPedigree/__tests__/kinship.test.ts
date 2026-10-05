import { describe, expect, test } from 'vitest';

import { resolveInterviewIntl } from '../../../i18n/resolveIntl';
import { formatPersonLabel, labelFamily } from '../kinship';
import { readFamily } from '../model';
import { config, link, person } from './fixtures';

const intl = resolveInterviewIntl();

/** Labels as English text, keyed by person id. */
function labelsOf(...args: Parameters<typeof readFamily>) {
  const family = readFamily(...args);
  return Object.fromEntries(
    [...labelFamily(family)].map(([id, label]) => [
      id,
      formatPersonLabel(label, intl),
    ]),
  );
}

describe('labelFamily', () => {
  test('named people keep their name and the participant is "You"', () => {
    const labels = labelsOf(
      [
        person('ego', { isEgo: true, name: 'Sarietha' }),
        person('mum', { name: 'Julie' }),
      ],
      [link('mum', 'ego', 'biological')],
      config,
    );
    expect(labels).toEqual({ ego: 'You', mum: 'Julie' });
  });

  test('unnamed close relatives are described by their gender and kind', () => {
    const labels = labelsOf(
      [
        person('ego', { isEgo: true }),
        person('mum', { gender: ['woman'] }),
        person('dad', { gender: ['man'] }),
        person('sis', { gender: ['woman'] }),
        person('half', { gender: ['man'] }),
        person('step', { gender: ['woman'] }),
        person('partner', { gender: ['nonBinary'] }),
        person('ex'),
        person('son', { gender: ['man'] }),
      ],
      [
        link('mum', 'dad', 'partner'),
        link('mum', 'ego', 'biological'),
        link('dad', 'ego', 'biological'),
        link('mum', 'sis', 'biological'),
        link('dad', 'sis', 'biological'),
        link('dad', 'half', 'biological'),
        link('step', 'ego', 'social'),
        link('ego', 'partner', 'partner'),
        link('ego', 'ex', 'partner', { current: false }),
        link('ego', 'son', 'biological'),
      ],
      config,
    );
    expect(labels).toMatchObject({
      mum: 'Mother',
      dad: 'Father',
      sis: 'Sister',
      half: 'Half-brother',
      step: 'Stepmother',
      partner: 'Partner',
      ex: 'Former partner',
      son: 'Son',
    });
  });

  test('donors are labelled by the gamete their recorded sex implies', () => {
    const labels = labelsOf(
      [
        person('ego', { isEgo: true }),
        person('egg', { sex: ['female'] }),
        person('sperm', { sex: ['male'] }),
        person('carrier', { gender: ['woman'] }),
      ],
      [
        link('egg', 'ego', 'donor'),
        link('sperm', 'ego', 'donor'),
        link('carrier', 'ego', 'surrogate', { carrier: true }),
      ],
      config,
    );
    expect(labels).toMatchObject({
      egg: 'Egg donor',
      sperm: 'Sperm donor',
      carrier: 'Surrogate',
    });
  });

  test('more distant relatives are described through the nearest person', () => {
    const labels = labelsOf(
      [
        person('ego', { isEgo: true }),
        person('mum', { gender: ['woman'] }),
        person('dad', { name: 'Rob', gender: ['man'] }),
        person('nan', { gender: ['woman'] }),
        person('robsDad', { gender: ['man'] }),
        person('aunt', { gender: ['woman'] }),
        person('cousin'),
      ],
      [
        link('mum', 'ego', 'biological'),
        link('dad', 'ego', 'biological'),
        link('nan', 'mum', 'biological'),
        link('robsDad', 'dad', 'biological'),
        link('nan', 'aunt', 'biological'),
        link('aunt', 'cousin', 'biological'),
      ],
      config,
    );
    expect(labels).toMatchObject({
      nan: "Mother's mother",
      robsDad: "Rob's father",
      aunt: "Mother's sister",
      cousin: "Mother's sister's child",
    });
  });

  test('unnamed people who would share a label are numbered', () => {
    const labels = labelsOf(
      [
        person('ego', { isEgo: true }),
        person('a'),
        person('b'),
        person('c', { gender: ['woman'] }),
      ],
      [
        link('ego', 'a', 'biological'),
        link('ego', 'b', 'biological'),
        link('ego', 'c', 'biological'),
      ],
      config,
    );
    expect(labels).toMatchObject({ a: 'Child 1', b: 'Child 2', c: 'Daughter' });
  });

  test('someone not connected to the participant is a family member', () => {
    const labels = labelsOf(
      [person('ego', { isEgo: true }), person('loose')],
      [],
      config,
    );
    expect(labels.loose).toBe('Family member');
  });
});
