import { describe, expect, test } from 'vitest';

import type { FramingId } from '@codaco/protocol-validation';
import type { NcEdge, NcNode } from '@codaco/shared-consts';

import { resolveInterviewIntl } from '../../../i18n/resolveIntl';
import {
  formatPersonLabel,
  KIN_TERMS,
  type KinTerm,
  labelFamily,
} from '../kinship';
import { messages } from '../messages';
import { readFamily, type PedigreeConfig } from '../model';
import { config, configWithoutGenderIdentity, link, person } from './fixtures';

const intl = resolveInterviewIntl();

/** Labels as English text, keyed by person id, read without the soft
 * hyphens where a long word may break inside a symbol. */
function labelsOf(
  nodes: NcNode[],
  edges: NcEdge[],
  framing: FramingId = 'gendered',
  stageConfig: PedigreeConfig = config,
) {
  const family = readFamily(nodes, edges, stageConfig);
  return Object.fromEntries(
    [...labelFamily(family, framing)].map(([id, label]) => [
      id,
      formatPersonLabel(label, intl).replace(/\u00AD/g, ''),
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
      nan: 'Grandparent',
      grandad: 'Grandparent',
      aunt: "Parent's sibling",
      uncle: "Parent's sibling",
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
      eggParent: 'Biological mother',
      spermParent: 'Biological father',
      nonBinary: 'Step-parent',
    });
    expect(labelsOf(nodes, edges, 'gamete')).toMatchObject({
      eggParent: 'Egg parent',
      spermParent: 'Sperm parent',
    });
  });

  test('a researcher-defined option takes the words it is mapped to', () => {
    // "transWoman" is not one of the six default options: the researcher
    // defined it and mapped it to feminine words.
    const nodes = [
      person('ego', { isEgo: true }),
      person('mum', { gender: ['transWoman'] }),
      person('sis', { gender: ['transWoman'] }),
      person('nan', { gender: ['transWoman'] }),
      person('dad', { gender: ['man'] }),
    ];
    const edges = [
      link('mum', 'ego', 'biological'),
      link('dad', 'ego', 'biological'),
      link('mum', 'sis', 'biological'),
      link('dad', 'sis', 'biological'),
      link('nan', 'mum', 'biological'),
    ];
    expect(labelsOf(nodes, edges)).toMatchObject({
      mum: 'Mother',
      sis: 'Sister',
      nan: 'Maternal grandmother',
    });
    // The gamete framing ignores gender words altogether.
    expect(labelsOf(nodes, edges, 'gamete')).toMatchObject({ sis: 'Sibling' });
  });

  test('an option with no mapping takes neutral words', () => {
    const nodes = [
      person('ego', { isEgo: true }),
      person('mum', { gender: ['agender'], sex: ['female'] }),
      person('sib', { gender: ['agender'] }),
    ];
    const edges = [
      link('mum', 'ego', 'biological'),
      link('mum', 'sib', 'biological'),
    ];
    // Neutral, not "biological mother": that is only for an unknown gender.
    expect(labelsOf(nodes, edges)).toMatchObject({
      mum: 'Parent',
      sib: 'Sibling',
    });
  });

  test('with gender identity not collected, the words follow sex assigned at birth', () => {
    // Whatever the people's recorded gender, the stage does not collect it, so
    // only sex assigned at birth decides: female feminine, male masculine,
    // anything else or unanswered neutral.
    const nodes = [
      person('ego', { isEgo: true }),
      person('mum', { sex: ['female'], gender: ['man'] }),
      person('dad', { sex: ['male'], gender: ['woman'] }),
      person('sis', { sex: ['female'] }),
      person('bro', { sex: ['male'] }),
      person('sib', { sex: ['intersex'] }),
      person('nan', { sex: ['female'] }),
      person('grandad', { sex: ['male'] }),
      person('unasked'),
    ];
    const edges = [
      link('mum', 'ego', 'biological'),
      link('dad', 'ego', 'biological'),
      link('mum', 'sis', 'biological'),
      link('dad', 'sis', 'biological'),
      link('mum', 'bro', 'biological'),
      link('dad', 'bro', 'biological'),
      link('mum', 'sib', 'biological'),
      link('dad', 'sib', 'biological'),
      link('nan', 'mum', 'biological'),
      link('grandad', 'dad', 'biological'),
      link('mum', 'unasked', 'biological'),
    ];
    expect(
      labelsOf(nodes, edges, 'gendered', configWithoutGenderIdentity),
    ).toMatchObject({
      mum: 'Mother',
      dad: 'Father',
      sis: 'Sister',
      bro: 'Brother',
      sib: 'Sibling',
      unasked: 'Half-sibling',
      nan: 'Maternal grandmother',
      grandad: 'Paternal grandfather',
    });
    // The gamete framing is unchanged.
    expect(
      labelsOf(nodes, edges, 'gamete', configWithoutGenderIdentity),
    ).toMatchObject({ mum: 'Egg parent', dad: 'Sperm parent' });
  });

  test('with gender identity not collected, a parent of another or unanswered sex is neutral, not named by gamete', () => {
    const nodes = [
      person('ego', { isEgo: true }),
      person('parent'),
      person('other', { sex: ['intersex'] }),
    ];
    const edges = [
      link('parent', 'ego', 'biological'),
      link('other', 'ego', 'biological'),
    ];
    expect(
      labelsOf(nodes, edges, 'gendered', configWithoutGenderIdentity),
    ).toMatchObject({ parent: 'Parent', other: 'Parent' });
  });

  test('the side of the family follows the first parent’s words, not their option', () => {
    const nodes = [
      person('ego', { isEgo: true }),
      person('mum', { gender: ['transWoman'] }),
      person('nan', { gender: ['woman'] }),
    ];
    const edges = [
      link('mum', 'ego', 'biological'),
      link('nan', 'mum', 'biological'),
    ];
    expect(labelsOf(nodes, edges)).toMatchObject({
      nan: 'Maternal grandmother',
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

  test('unnamed people may share a kinship word, which generateLabels tells apart', () => {
    const labels = labelsOf(
      [person('ego', { isEgo: true }), person('a'), person('b'), woman('c')],
      [
        link('ego', 'a', 'biological'),
        link('ego', 'b', 'biological'),
        link('ego', 'c', 'biological'),
      ],
    );
    expect(labels).toMatchObject({ a: 'Child', b: 'Child', c: 'Daughter' });
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

describe('soft hyphens', () => {
  const term = (kinTerm: KinTerm) =>
    formatPersonLabel({ type: 'term', term: kinTerm }, intl);

  test('long kinship words carry a soft hyphen at a syllable break, so they break there inside a symbol', () => {
    const long: KinTerm[] = [
      'grandmother',
      'granddaughter',
      'stepdaughter',
      'stepbrother',
      'maternalGrandparent',
      'greatGrandmother',
      'grandparentsSibling',
      'surrogate',
      'biologicalMother',
    ];
    expect(
      Object.fromEntries(long.map((kinTerm) => [kinTerm, term(kinTerm)])),
    ).toEqual({
      grandmother: 'Grand\u00ADmother',
      granddaughter: 'Grand\u00ADdaughter',
      stepdaughter: 'Step\u00ADdaughter',
      stepbrother: 'Step\u00ADbrother',
      maternalGrandparent: 'Maternal grand\u00ADparent',
      greatGrandmother: 'Great-grand\u00ADmother',
      grandparentsSibling: "Grand\u00ADparent's sibling",
      surrogate: 'Surro\u00ADgate',
      biologicalMother: 'Bio\u00ADlogical mother',
    });
    expect(
      formatPersonLabel(
        {
          type: 'relativeOf',
          owner: { type: 'term', term: 'cousin' },
          term: 'stepmother',
        },
        intl,
      ),
    ).toBe("Cousin's step\u00ADmother");
  });

  test('short words, and words that fit a symbol whole, have none', () => {
    const short: KinTerm[] = [
      'mother',
      'grandson',
      'stepson',
      'stepchild',
      'halfSister',
    ];
    for (const kinTerm of short) {
      expect(term(kinTerm)).not.toContain('\u00AD');
    }
  });
});
