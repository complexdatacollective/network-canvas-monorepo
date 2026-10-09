import { describe, expect, test } from 'vitest';

import type { FramingId } from '@codaco/protocol-validation';
import type { NcEdge, NcNode } from '@codaco/shared-consts';

import {
  formatPersonLabel,
  formatRelativeTerm,
  KIN_TERMS,
  type KinTerm,
  labelFamily,
} from '../kinship';
import { messages } from '../messages';
import { readFamily, type PedigreeConfig } from '../model';
import { relationshipsToParticipant } from '../relationshipToParticipant';
import { config, configWithoutGenderIdentity, link, person } from './fixtures';
import { pedigreeWordsIn } from './pedigreeWords';

const words = pedigreeWordsIn();

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
      formatPersonLabel(label, words).replace(/\u00AD/g, ''),
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
      aunt: 'Parent’s sibling',
      uncle: 'Parent’s sibling',
      cousin: 'Cousin',
      nephew: 'Sibling’s child',
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
      // Raising them, and no parent's partner: the plain parent word.
      nonBinary: 'Parent',
    });
    expect(labelsOf(nodes, edges, 'gamete')).toMatchObject({
      eggParent: 'Egg parent',
      spermParent: 'Sperm parent',
    });
  });

  test('a parent who is neither female nor male at birth is named by the gamete the shared rule derives', () => {
    // Paired with a parent recorded male, an intersex genetic parent gave the
    // egg by elimination; the labels agree with the genetics.
    const nodes = [
      person('ego', { isEgo: true }),
      person('intersexParent', { sex: ['intersex'] }),
      person('maleParent', { sex: ['male'], gender: ['unknown'] }),
      person('sibling', { isEgo: false }),
      person('intersexDonor', { sex: ['intersex'] }),
      person('mum', { sex: ['female'], gender: ['unknown'] }),
    ];
    const edges = [
      link('intersexParent', 'ego', 'biological'),
      link('maleParent', 'ego', 'biological'),
      link('intersexDonor', 'sibling', 'donor'),
      link('mum', 'sibling', 'biological'),
      link('maleParent', 'mum', 'partner'),
    ];
    expect(labelsOf(nodes, edges, 'gamete')).toMatchObject({
      intersexParent: 'Egg parent',
      maleParent: 'Sperm parent',
    });
    expect(labelsOf(nodes, edges)).toMatchObject({
      intersexParent: 'Biological mother',
      maleParent: 'Biological father',
    });
    // Two genetic parents who are both neither female nor male: no gamete is
    // known, so neither is named by one.
    expect(
      labelsOf(
        [
          person('ego', { isEgo: true }),
          person('a', { sex: ['intersex'] }),
          person('b', { sex: ['unknown'] }),
        ],
        [link('a', 'ego', 'biological'), link('b', 'ego', 'biological')],
        'gamete',
      ),
    ).toMatchObject({ a: 'Parent', b: 'Parent' });
    // A donor is named by the gamete they gave the child they are a donor to.
    const donorFamily = readFamily(
      [
        person('ego', { isEgo: true }),
        person('intersexDonor', { sex: ['intersex'] }),
        person('dad', { sex: ['male'] }),
      ],
      [link('intersexDonor', 'ego', 'donor'), link('dad', 'ego', 'biological')],
      config,
    );
    expect(
      formatPersonLabel(
        labelFamily(donorFamily, 'gamete').get('intersexDonor')!,
        words,
      ),
    ).toBe('Egg donor');
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
    expect(labels.cousinsSon).toBe('Cousin’s Son');
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

  test('someone not connected to the participant is described as a relative', () => {
    expect(
      labelsOf([person('ego', { isEgo: true }), person('loose')], []).loose,
    ).toBe('Relative');
  });

  test('every kinship word has its own wording', () => {
    for (const term of KIN_TERMS) {
      expect(words.text(words.wording.relativeTerm, { term })).not.toBe(
        'Relative',
      );
      // Anyone can be described through a relative by any kinship word.
      expect(
        words.text(words.wording.generatedLabelOf, {
          relation: 'owner',
          owner: 'Isaac',
          term: formatRelativeTerm(term, words),
        }),
      ).not.toBe('Isaac’s Relative');
    }
  });
});

/** Each person's canvas label and saved relationship to the participant,
 * which must name the same tie. */
function tiesOf(nodes: NcNode[], edges: NcEdge[]) {
  const family = readFamily(nodes, edges, config);
  const labels = labelFamily(family, 'gendered');
  const relationships = relationshipsToParticipant(family);
  return Object.fromEntries(
    [...relationships].map(([id, relationship]) => [
      id,
      [
        formatPersonLabel(labels.get(id)!, words).replace(/\u00AD/g, ''),
        relationship,
      ],
    ]),
  );
}

describe('siblings', () => {
  const ego = person('ego', { isEgo: true });

  test.each([
    {
      family: 'an adopted participant and their birth parents',
      nodes: [ego, woman('shannon'), man('tom'), woman('karen'), man('bro')],
      edges: [
        link('shannon', 'ego', 'biological', { carrier: true }),
        link('tom', 'ego', 'biological'),
        link('karen', 'ego', 'adoptive'),
        link('shannon', 'bro', 'biological', { carrier: true }),
        link('tom', 'bro', 'biological'),
      ],
      // An adoptive parent does not make a full biological brother a half
      // brother.
      expected: { bro: ['Brother', 'sibling'] },
    },
    {
      family: 'an adopted participant with one birth parent recorded',
      nodes: [ego, woman('shannon'), woman('karen'), man('dylan')],
      edges: [
        link('shannon', 'ego', 'biological', { carrier: true }),
        link('karen', 'ego', 'adoptive'),
        link('shannon', 'dylan', 'biological', { carrier: true }),
      ],
      expected: { dylan: ['Brother', 'sibling'] },
    },
    {
      family: 'a donor and a birth mother',
      nodes: [
        ego,
        woman('ann'),
        person('lisa', { sex: ['female'] }),
        man('mark'),
        woman('zoe'),
      ],
      edges: [
        link('ann', 'ego', 'biological', { carrier: true }),
        link('lisa', 'ego', 'donor'),
        link('lisa', 'zoe', 'biological', { carrier: true }),
        link('mark', 'zoe', 'biological'),
      ],
      // A donor is a genetic parent, so their child is a half sibling.
      expected: { zoe: ['Half-sister', 'halfSibling'] },
    },
    {
      family: 'two partnered donors',
      nodes: [
        ego,
        person('lisa', { sex: ['female'] }),
        person('mark', { sex: ['male'] }),
        woman('ella'),
        woman('zoe'),
      ],
      edges: [
        link('lisa', 'ego', 'donor'),
        link('mark', 'ego', 'donor'),
        link('lisa', 'mark', 'partner'),
        link('lisa', 'ella', 'biological', { carrier: true }),
        link('mark', 'ella', 'biological'),
        link('lisa', 'zoe', 'biological', { carrier: true }),
      ],
      // Not step-siblings through the donor's partner.
      expected: {
        ella: ['Sister', 'sibling'],
        zoe: ['Half-sister', 'halfSibling'],
      },
    },
    {
      family: 'children adopted by the same parent',
      nodes: [ego, woman('karen'), woman('ruby')],
      edges: [
        link('karen', 'ego', 'adoptive'),
        link('karen', 'ruby', 'adoptive'),
      ],
      // Related only through adoption: the label says so.
      expected: { ruby: ['Adoptive sister', 'adoptiveSibling'] },
    },
    {
      family: "an adopted participant and their adoptive parent's birth child",
      nodes: [ego, woman('karen'), man('jack')],
      edges: [
        link('karen', 'ego', 'adoptive'),
        link('karen', 'jack', 'biological', { carrier: true }),
      ],
      expected: { jack: ['Adoptive brother', 'adoptiveSibling'] },
    },
  ])(
    '$family: the label and the relationship agree',
    ({ nodes, edges, expected }) => {
      expect(tiesOf(nodes, edges)).toMatchObject(expected);
    },
  );
});

test('a sibling related only through adoption is an adoptive sibling in the words that assume no gender', () => {
  const nodes = [
    person('ego', { isEgo: true }),
    woman('karen'),
    woman('ruby'),
    person('sam'),
  ];
  const edges = [
    link('karen', 'ego', 'adoptive'),
    link('karen', 'ruby', 'adoptive'),
    link('karen', 'sam', 'adoptive'),
  ];
  expect(labelsOf(nodes, edges, 'gamete')).toMatchObject({
    ruby: 'Adoptive sibling',
    sam: 'Adoptive sibling',
  });
  expect(labelsOf(nodes, edges).sam).toBe('Adoptive sibling');
});

describe('grandchildren', () => {
  const ego = man('ego', { isEgo: true });

  test('a grandchild related only through an adoption is an adoptive grandchild', () => {
    expect(
      tiesOf(
        [ego, man('luke'), woman('zara'), man('sam'), woman('ivy')],
        [
          link('ego', 'luke', 'biological'),
          link('luke', 'zara', 'adoptive'),
          link('ego', 'sam', 'adoptive'),
          link('sam', 'ivy', 'biological'),
        ],
      ),
    ).toMatchObject({
      zara: ['Granddaughter', 'adoptiveGrandchild'],
      ivy: ['Granddaughter', 'adoptiveGrandchild'],
    });
  });

  test('a biological grandchild is a grandchild, even when also adopted', () => {
    expect(
      tiesOf(
        [ego, man('luke'), man('sam'), woman('zara')],
        [
          link('ego', 'luke', 'biological'),
          link('ego', 'sam', 'biological'),
          link('luke', 'zara', 'biological'),
          link('sam', 'zara', 'adoptive'),
        ],
      ).zara,
    ).toEqual(['Granddaughter', 'grandchild']);
  });
});

describe('side of the family', () => {
  const ego = person('ego', { isEgo: true });

  test('someone reached through both parents is given no side', () => {
    // A sperm donor to both parents.
    expect(
      labelsOf(
        [
          ego,
          woman('emma'),
          man('liam'),
          person('donor', { gender: ['unknown'], sex: ['male'] }),
        ],
        [
          link('emma', 'ego', 'biological', { carrier: true }),
          link('liam', 'ego', 'biological'),
          link('emma', 'liam', 'partner'),
          link('donor', 'emma', 'donor'),
          link('donor', 'liam', 'donor'),
        ],
      ).donor,
    ).toBe('Grandparent');
    // Parents who are half-siblings share their mother.
    expect(
      labelsOf(
        [ego, woman('mum'), man('dad'), woman('nan')],
        [
          link('mum', 'ego', 'biological'),
          link('dad', 'ego', 'biological'),
          link('nan', 'mum', 'biological'),
          link('nan', 'dad', 'biological'),
        ],
      ).nan,
    ).toBe('Grandmother');
  });

  test('a biological parent with unknown gender words gives the side of the gamete they gave', () => {
    const nodes = [
      man('ego', { isEgo: true }),
      person('dad', { gender: ['unknown'], sex: ['male'] }),
      person('gp1'),
      person('gp2'),
      person('aunt', { gender: ['woman'] }),
    ];
    const edges = [
      link('dad', 'ego', 'biological'),
      link('gp1', 'dad', 'biological'),
      link('gp2', 'dad', 'biological'),
      link('gp1', 'aunt', 'biological'),
      link('gp2', 'aunt', 'biological'),
    ];
    expect(labelsOf(nodes, edges)).toMatchObject({
      dad: 'Biological father',
      gp1: 'Paternal grandparent',
      gp2: 'Paternal grandparent',
      aunt: 'Paternal aunt',
    });
  });
});

describe('step and in-law relatives', () => {
  // Each parent or child step in a step or in-law tie is one that raises the
  // child (biological, adoptive or social), and each partnership on the way
  // is current. Otherwise the person has no step or in-law word.
  const ego = man('ego', { isEgo: true });
  const raising = ['biological', 'adoptive', 'social'] as const;
  const notRaising = ['donor', 'surrogate'] as const;

  describe("a parent's partner", () => {
    test.each(raising)(
      'through a %s parent, currently partnered, is a step-parent',
      (kind) => {
        expect(
          tiesOf(
            [ego, man('dad'), woman('her')],
            [link('dad', 'ego', kind), link('dad', 'her', 'partner')],
          ).her,
        ).toEqual(['Stepmother', 'stepParent']);
      },
    );
    test.each(notRaising)('through a %s is not', (kind) => {
      expect(
        tiesOf(
          [ego, man('dad'), woman('her')],
          [link('dad', 'ego', kind), link('dad', 'her', 'partner')],
        ).her?.[1],
      ).toBe('otherRelative');
    });
    test('who is a former partner is not', () => {
      expect(
        tiesOf(
          [ego, man('dad'), woman('her')],
          [
            link('dad', 'ego', 'biological'),
            link('dad', 'her', 'partner', { current: false }),
          ],
        ).her,
      ).toEqual(['Father’s Former partner', 'otherRelative']);
    });
  });

  describe("a partner's child", () => {
    test.each(raising)(
      'a %s child of a current partner is a step-child',
      (kind) => {
        expect(
          tiesOf(
            [ego, woman('wife'), man('kid')],
            [link('ego', 'wife', 'partner'), link('wife', 'kid', kind)],
          ).kid,
        ).toEqual(['Stepson', 'stepChild']);
      },
    );
    test.each(notRaising)('a %s child is not', (kind) => {
      expect(
        tiesOf(
          [ego, woman('wife'), man('kid')],
          [link('ego', 'wife', 'partner'), link('wife', 'kid', kind)],
        ).kid?.[1],
      ).toBe('otherRelative');
    });
    test("a former partner's child is not", () => {
      expect(
        tiesOf(
          [ego, woman('ex'), man('kid')],
          [
            link('ego', 'ex', 'partner', { current: false }),
            link('ex', 'kid', 'biological'),
          ],
        ).kid,
      ).toEqual(['Former partner’s Son', 'otherRelative']);
    });
  });

  describe("a partner's parent", () => {
    test.each(raising)(
      'a %s parent of a current partner is a parent-in-law',
      (kind) => {
        expect(
          tiesOf(
            [ego, woman('wife'), woman('her')],
            [link('ego', 'wife', 'partner'), link('her', 'wife', kind)],
          ).her,
        ).toEqual(['Mother-in-law', 'parentInLaw']);
      },
    );
    test.each(notRaising)('a %s is not', (kind) => {
      expect(
        tiesOf(
          [ego, woman('wife'), woman('her')],
          [link('ego', 'wife', 'partner'), link('her', 'wife', kind)],
        ).her?.[1],
      ).toBe('otherRelative');
    });
    test("a former partner's parent is not", () => {
      expect(
        tiesOf(
          [ego, woman('ex'), woman('her')],
          [
            link('ego', 'ex', 'partner', { current: false }),
            link('her', 'ex', 'biological'),
          ],
        ).her?.[1],
      ).toBe('otherRelative');
    });
  });

  describe("a child's partner", () => {
    test.each(raising)(
      "a %s child's current partner is a child-in-law",
      (kind) => {
        expect(
          tiesOf(
            [ego, man('kid'), woman('her')],
            [link('ego', 'kid', kind), link('kid', 'her', 'partner')],
          ).her,
        ).toEqual(['Daughter-in-law', 'childInLaw']);
      },
    );
    test.each(notRaising)("a %s child's partner is not", (kind) => {
      expect(
        tiesOf(
          [ego, man('kid'), woman('her')],
          [link('ego', 'kid', kind), link('kid', 'her', 'partner')],
        ).her?.[1],
      ).toBe('otherRelative');
    });
    test("a child's former partner is not", () => {
      expect(
        tiesOf(
          [ego, man('kid'), woman('her')],
          [
            link('ego', 'kid', 'biological'),
            link('kid', 'her', 'partner', { current: false }),
          ],
        ).her?.[1],
      ).toBe('otherRelative');
    });
    test("a partner's child's partner is a child-in-law whether or not the step link is drawn", () => {
      const nodes = [ego, man('frank'), man('greg'), woman('leah')];
      const edges = [
        link('ego', 'frank', 'partner'),
        link('frank', 'greg', 'biological'),
        link('greg', 'leah', 'partner'),
      ];
      expect(tiesOf(nodes, edges).leah?.[1]).toBe('childInLaw');
      expect(
        tiesOf(nodes, [...edges, link('ego', 'greg', 'social')]).leah?.[1],
      ).toBe('childInLaw');
    });
  });

  describe("a parent's partner's child", () => {
    test("a current partner's child is a step-sibling", () => {
      expect(
        tiesOf(
          [ego, man('dad'), woman('her'), woman('kid')],
          [
            link('dad', 'ego', 'biological'),
            link('dad', 'her', 'partner'),
            link('her', 'kid', 'biological'),
          ],
        ).kid,
      ).toEqual(['Stepsister', 'stepSibling']);
    });
    test("a former partner's child is not", () => {
      expect(
        tiesOf(
          [ego, man('dad'), woman('her'), woman('kid')],
          [
            link('dad', 'ego', 'biological'),
            link('dad', 'her', 'partner', { current: false }),
            link('her', 'kid', 'biological'),
          ],
        ).kid?.[1],
      ).toBe('otherRelative');
    });
    test("a donor's partner's child is not", () => {
      expect(
        tiesOf(
          [ego, person('lisa', { sex: ['female'] }), man('mark'), man('finn')],
          [
            link('lisa', 'ego', 'donor'),
            link('lisa', 'mark', 'partner'),
            link('mark', 'finn', 'biological'),
          ],
        ).finn?.[1],
      ).toBe('otherRelative');
    });
  });

  test("a sibling's former partner is not a sibling-in-law", () => {
    const nodes = [ego, woman('mum'), man('bro'), woman('her')];
    const edges = [
      link('mum', 'ego', 'biological'),
      link('mum', 'bro', 'biological'),
    ];
    expect(
      tiesOf(nodes, [...edges, link('bro', 'her', 'partner')]).her,
    ).toEqual(['Sister-in-law', 'siblingInLaw']);
    expect(
      tiesOf(nodes, [
        ...edges,
        link('bro', 'her', 'partner', { current: false }),
      ]).her?.[1],
    ).toBe('otherRelative');
  });

  test("a partner's sibling is a sibling-in-law only while the partnership is current", () => {
    const nodes = [ego, woman('her'), woman('mum'), man('bro')];
    const edges = [
      link('mum', 'her', 'biological'),
      link('mum', 'bro', 'biological'),
    ];
    expect(
      tiesOf(nodes, [...edges, link('ego', 'her', 'partner')]).bro,
    ).toEqual(['Brother-in-law', 'siblingInLaw']);
    expect(
      tiesOf(nodes, [
        ...edges,
        link('ego', 'her', 'partner', { current: false }),
      ]).bro?.[1],
    ).toBe('otherRelative');
  });

  describe('a step or social parent', () => {
    // A step or social parent link is a step-parent's when the step or
    // social parent has a partnership, current or former, with one of the
    // child's biological or adoptive parents, and did not carry them.
    // Anyone else raising the child takes the plain parent word.
    test.each([
      ['a current', true],
      ['a former', false],
    ])(
      "who is %s partner of the child's parent is a step-parent",
      (_, current) => {
        expect(
          tiesOf(
            [ego, man('dad'), woman('her')],
            [
              link('dad', 'ego', 'biological'),
              link('her', 'ego', 'social'),
              link('dad', 'her', 'partner', { current }),
            ],
          ).her,
        ).toEqual(['Stepmother', 'stepParent']);
      },
    );
    test("who is no parent's partner takes the plain parent word", () => {
      expect(
        tiesOf(
          [ego, man('dad'), woman('her'), man('him'), person('them')],
          [
            link('dad', 'ego', 'biological'),
            link('her', 'ego', 'social'),
            link('him', 'ego', 'social'),
            link('them', 'ego', 'social'),
          ],
        ),
      ).toMatchObject({
        her: ['Mother', 'stepParent'],
        him: ['Father', 'stepParent'],
        them: ['Parent', 'stepParent'],
      });
    });
    test('who carried the child takes the plain parent word', () => {
      expect(
        tiesOf(
          [ego, woman('mum'), woman('her')],
          [
            link('mum', 'ego', 'biological'),
            link('her', 'ego', 'social', { carrier: true }),
            link('mum', 'her', 'partner'),
          ],
        ).her,
      ).toEqual(['Mother', 'stepParent']);
    });
    test('whose partner is another social parent takes the plain parent word', () => {
      expect(
        tiesOf(
          [ego, woman('her'), man('him')],
          [
            link('her', 'ego', 'social'),
            link('him', 'ego', 'social'),
            link('her', 'him', 'partner'),
          ],
        ),
      ).toMatchObject({
        her: ['Mother', 'stepParent'],
        him: ['Father', 'stepParent'],
      });
    });
    test('the child of a social parent who is not a step-parent is a son or daughter', () => {
      expect(
        tiesOf(
          [ego, woman('kid'), man('dad'), man('boy')],
          [
            link('ego', 'kid', 'social'),
            link('dad', 'boy', 'biological'),
            link('ego', 'boy', 'social'),
            link('ego', 'dad', 'partner', { current: false }),
          ],
        ),
      ).toMatchObject({
        kid: ['Daughter', 'stepChild'],
        boy: ['Stepson', 'stepChild'],
      });
    });
  });

  describe('a step-grandparent', () => {
    test("a grandparent's current partner is a step-grandparent", () => {
      const nodes = [ego, man('rob'), man('frank'), woman('pat')];
      const edges = [
        link('rob', 'ego', 'biological'),
        link('frank', 'rob', 'biological'),
      ];
      expect(
        tiesOf(nodes, [...edges, link('frank', 'pat', 'partner')]).pat,
      ).toEqual(['Step-grandmother', 'stepGrandparent']);
      expect(
        tiesOf(nodes, [
          ...edges,
          link('frank', 'pat', 'partner', { current: false }),
        ]).pat?.[1],
      ).toBe('otherRelative');
    });
    test("a step-parent's parent is a step-grandparent", () => {
      expect(
        tiesOf(
          [ego, man('dad'), woman('her'), woman('herMum')],
          [
            link('dad', 'ego', 'biological'),
            link('dad', 'her', 'partner'),
            link('herMum', 'her', 'biological'),
          ],
        ).herMum,
      ).toEqual(['Step-grandmother', 'stepGrandparent']);
      // Drawn as the step-parent she is.
      expect(
        tiesOf(
          [ego, man('dad'), woman('her'), woman('herMum')],
          [
            link('dad', 'ego', 'biological'),
            link('her', 'ego', 'social'),
            link('dad', 'her', 'partner', { current: false }),
            link('herMum', 'her', 'biological'),
          ],
        ).herMum,
      ).toEqual(['Step-grandmother', 'stepGrandparent']);
    });
    test('a grandparent who is also a grandparent’s partner is a grandparent', () => {
      expect(
        tiesOf(
          [ego, man('rob'), man('frank'), woman('nan')],
          [
            link('rob', 'ego', 'biological'),
            link('frank', 'rob', 'biological'),
            link('nan', 'rob', 'biological'),
            link('frank', 'nan', 'partner'),
          ],
        ).nan,
      ).toEqual(['Paternal grandmother', 'grandparent']);
    });
  });

  test("a step-parent's former partner, and a donor's partner, are not step-parents", () => {
    // The family from the report: a mother, a sperm donor and a step-father.
    expect(
      tiesOf(
        [
          ego,
          woman('ann'),
          person('dan', { sex: ['male'] }),
          man('paul'),
          woman('dansPartner'),
          woman('paulsEx'),
          man('annsEx'),
        ],
        [
          link('ann', 'ego', 'biological', { carrier: true }),
          link('dan', 'ego', 'donor'),
          link('paul', 'ego', 'social'),
          link('ann', 'paul', 'partner'),
          link('dan', 'dansPartner', 'partner'),
          link('paul', 'paulsEx', 'partner', { current: false }),
          link('ann', 'annsEx', 'partner', { current: false }),
        ],
      ),
    ).toMatchObject({
      paul: ['Stepfather', 'stepParent'],
      dansPartner: ['Sperm donor’s Partner', 'otherRelative'],
      paulsEx: ['Stepfather’s Former partner', 'otherRelative'],
      annsEx: ['Mother’s Former partner', 'otherRelative'],
    });
  });
});

describe('apostrophes', () => {
  test('English copy uses the typographic apostrophe, never a straight one outside ICU quoting', () => {
    // In ICU messages a straight apostrophe quotes a following brace, hash,
    // pipe or apostrophe; anywhere else it is text, which should be U+2019.
    const straight = /(?<!')'(?![{}#|'])/;
    const copy = [
      ...Object.entries(messages).map(
        ([key, message]) => [key, message.defaultMessage ?? ''] as const,
      ),
      ...Object.entries(words.wording).map(
        ([key, value]) => [`wording.${key}`, value?.en ?? ''] as const,
      ),
    ];
    const offending = copy
      .filter(([, text]) => straight.test(text))
      .map(([key]) => key);
    expect(offending).toEqual([]);
  });

  test('a label described through a relative reads with a typographic apostrophe', () => {
    expect(
      labelsOf(
        [
          person('ego', { isEgo: true }),
          woman('mum'),
          man('bro'),
          woman('priya', { name: 'Priya' }),
          woman('priyasMum'),
        ],
        [
          link('mum', 'ego', 'biological'),
          link('mum', 'bro', 'biological'),
          link('bro', 'priya', 'partner'),
          link('priyasMum', 'priya', 'biological'),
        ],
      ).priyasMum,
    ).toBe('Priya\u2019s Mother');
  });
});

describe('soft hyphens', () => {
  const term = (kinTerm: KinTerm) =>
    formatPersonLabel({ type: 'term', term: kinTerm }, words);

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
      grandparentsSibling: 'Grand\u00ADparent’s sibling',
      surrogate: 'Surro\u00ADgate',
      biologicalMother: 'Bio\u00ADlogical mother',
    });
    expect(
      formatPersonLabel(
        {
          type: 'relativeOf',
          anchors: [
            {
              ownerId: 'cousin',
              owner: { type: 'term', term: 'cousin' },
              term: 'stepmother',
            },
          ],
        },
        words,
      ),
    ).toBe('Cousin’s Step\u00ADmother');
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
