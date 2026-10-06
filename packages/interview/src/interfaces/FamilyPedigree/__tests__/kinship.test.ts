import { describe, expect, test } from 'vitest';

import type { FramingId } from '@codaco/protocol-validation';
import type { NcEdge, NcNode } from '@codaco/shared-consts';

import { resolveInterviewIntl } from '../../../i18n/resolveIntl';
import { formatPersonLabel, KIN_TERMS, labelFamily } from '../kinship';
import { messages } from '../messages';
import { readFamily } from '../model';
import { config, link, person } from './fixtures';

const intl = resolveInterviewIntl();

/** Labels as English text, keyed by person id. */
function labelsOf(
  nodes: NcNode[],
  edges: NcEdge[],
  framing: FramingId = 'gendered',
) {
  const family = readFamily(nodes, edges, config);
  return Object.fromEntries(
    [...labelFamily(family, framing)].map(([id, label]) => [
      id,
      formatPersonLabel(label, intl),
    ]),
  );
}

const woman = (id: string, extra = {}) =>
  person(id, { gender: ['woman'], sex: ['female'], ...extra });
const man = (id: string, extra = {}) =>
  person(id, { gender: ['man'], sex: ['male'], ...extra });

/** Ego, two parents, a grandparent on each side, an aunt and her child. */
const extendedNodes = [
  person('ego', { isEgo: true }),
  woman('mum'),
  man('dad'),
  woman('nan'),
  man('grandad'),
  woman('aunt'),
  person('cousin'),
  man('uncle'),
  person('nephew', { gender: ['man'] }),
  woman('sis'),
  person('kid', { gender: ['woman'] }),
  person('grandkid', { gender: ['man'] }),
];
const extendedEdges = [
  link('mum', 'ego', 'biological'),
  link('dad', 'ego', 'biological'),
  link('mum', 'sis', 'biological'),
  link('dad', 'sis', 'biological'),
  link('sis', 'nephew', 'biological'),
  link('nan', 'mum', 'biological'),
  link('nan', 'aunt', 'biological'),
  link('aunt', 'cousin', 'biological'),
  link('grandad', 'dad', 'biological'),
  link('grandad', 'uncle', 'biological'),
  link('ego', 'kid', 'biological'),
  link('kid', 'grandkid', 'biological'),
];

describe('labelFamily', () => {
  test('named people keep their name and the participant is "You"', () => {
    const labels = labelsOf(
      [
        person('ego', { isEgo: true, name: 'Sarietha' }),
        woman('mum', { name: 'Julie' }),
      ],
      [link('mum', 'ego', 'biological')],
    );
    expect(labels).toEqual({ ego: 'You', mum: 'Julie' });
  });

  test('gendered framing: kinship words by gender identity, with the side of the family', () => {
    expect(labelsOf(extendedNodes, extendedEdges)).toMatchObject({
      mum: 'Mother',
      dad: 'Father',
      sis: 'Sister',
      nan: 'Maternal grandmother',
      grandad: 'Paternal grandfather',
      aunt: 'Maternal aunt',
      uncle: 'Paternal uncle',
      cousin: 'Cousin',
      nephew: 'Nephew',
      kid: 'Daughter',
      grandkid: 'Grandson',
    });
  });

  test('gamete framing: egg and sperm parents, neutral words for everyone else', () => {
    expect(labelsOf(extendedNodes, extendedEdges, 'gamete')).toMatchObject({
      mum: 'Egg parent',
      dad: 'Sperm parent',
      sis: 'Sibling',
      nan: 'Grandparent 1',
      grandad: 'Grandparent 2',
      aunt: "Parent's sibling 1",
      uncle: "Parent's sibling 2",
      cousin: 'Cousin',
      nephew: "Sibling's child",
      kid: 'Child',
      grandkid: 'Grandchild',
    });
  });

  test('the gendered framing follows gender identity, the gamete framing sex at birth', () => {
    const nodes = [
      person('ego', { isEgo: true }),
      person('dad', { gender: ['man'], sex: ['female'] }),
      person('parent', { gender: ['nonBinary'], sex: ['male'] }),
    ];
    const edges = [
      link('dad', 'ego', 'biological', { carrier: true }),
      link('parent', 'ego', 'biological'),
    ];
    expect(labelsOf(nodes, edges)).toMatchObject({
      dad: 'Father',
      parent: 'Parent',
    });
    expect(labelsOf(nodes, edges, 'gamete')).toMatchObject({
      dad: 'Egg parent',
      parent: 'Sperm parent',
    });
  });

  test('a biological parent with no gender identity is named by sex at birth in the gendered framing', () => {
    const nodes = [
      person('ego', { isEgo: true }),
      person('eggParent', { sex: ['female'] }),
      person('spermParent', { sex: ['male'], gender: ['unknown'] }),
      person('nonBinary', { sex: ['female'], gender: ['nonBinary'] }),
    ];
    const edges = [
      link('eggParent', 'ego', 'biological'),
      link('spermParent', 'ego', 'biological'),
      link('nonBinary', 'ego', 'social'),
    ];
    expect(labelsOf(nodes, edges)).toMatchObject({
      eggParent: 'Bio\u00ADlogical mother',
      spermParent: 'Bio\u00ADlogical father',
      nonBinary: 'Step-parent',
    });
    expect(labelsOf(nodes, edges, 'gamete')).toMatchObject({
      eggParent: 'Egg parent',
      spermParent: 'Sperm parent',
    });
  });

  test('step, half and in-law relatives', () => {
    const labels = labelsOf(
      [
        person('ego', { isEgo: true }),
        woman('mum'),
        man('dad'),
        woman('stepmum'),
        man('half'),
        person('stepsib', { gender: ['woman'] }),
        person('partner'),
        woman('partnersMum'),
        person('ex'),
      ],
      [
        link('mum', 'ego', 'biological'),
        link('dad', 'ego', 'biological'),
        link('dad', 'stepmum', 'partner'),
        link('dad', 'half', 'biological'),
        link('stepmum', 'half', 'biological'),
        link('stepmum', 'stepsib', 'biological'),
        link('ego', 'partner', 'partner'),
        link('partnersMum', 'partner', 'biological'),
        link('ego', 'ex', 'partner', { current: false }),
      ],
    );
    expect(labels).toMatchObject({
      stepmum: 'Stepmother',
      half: 'Half-brother',
      stepsib: 'Stepsister',
      partner: 'Partner',
      partnersMum: 'Mother-in-law',
      ex: 'Former partner',
    });
  });

  test('donors and carriers', () => {
    const labels = labelsOf(
      [
        person('ego', { isEgo: true }),
        person('egg', { sex: ['female'] }),
        person('sperm', { sex: ['male'] }),
        woman('carrier'),
      ],
      [
        link('egg', 'ego', 'donor'),
        link('sperm', 'ego', 'donor'),
        link('carrier', 'ego', 'surrogate', { carrier: true }),
      ],
    );
    expect(labels).toMatchObject({
      egg: 'Egg donor',
      sperm: 'Sperm donor',
      carrier: 'Surrogate',
    });
  });

  test('relatives beyond the kinship words are described through the person before them', () => {
    const labels = labelsOf(
      [...extendedNodes, man('cousinsSon')],
      [...extendedEdges, link('cousin', 'cousinsSon', 'biological')],
    );
    expect(labels.cousinsSon).toBe("Cousin's son");
  });

  test('unnamed people who would share a label are numbered', () => {
    const labels = labelsOf(
      [person('ego', { isEgo: true }), person('a'), person('b'), woman('c')],
      [
        link('ego', 'a', 'biological'),
        link('ego', 'b', 'biological'),
        link('ego', 'c', 'biological'),
      ],
    );
    expect(labels).toMatchObject({ a: 'Child 1', b: 'Child 2', c: 'Daughter' });
  });

  test('someone not connected to the participant is a family member', () => {
    expect(
      labelsOf([person('ego', { isEgo: true }), person('loose')], []).loose,
    ).toBe('Family member');
  });

  test('every kinship word has its own wording', () => {
    for (const term of KIN_TERMS) {
      expect(intl.formatMessage(messages.relativeTerm, { term })).not.toBe(
        'Relative',
      );
    }
  });
});
