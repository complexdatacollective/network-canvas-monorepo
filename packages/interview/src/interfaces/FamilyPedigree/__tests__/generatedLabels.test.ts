import { describe, expect, test } from 'vitest';

import type { FramingId } from '@codaco/protocol-validation';
import type { NcEdge, NcNode } from '@codaco/shared-consts';

import { resolveInterviewIntl } from '../../../i18n/resolveIntl';
import { generateLabels, labelEveryone, labelWrites } from '../generatedLabels';
import { nameFingerprint, readFamily, type PedigreeConfig } from '../model';
import { config, configWithoutGenderIdentity, link, person } from './fixtures';

const intl = resolveInterviewIntl();

/** The generated labels as English text, keyed by person id. */
function labelsOf(
  nodes: NcNode[],
  edges: NcEdge[],
  framing: FramingId = 'gendered',
  stageConfig: PedigreeConfig = config,
) {
  return Object.fromEntries(
    generateLabels(readFamily(nodes, edges, stageConfig), framing, intl),
  );
}

const woman = (id: string, extra = {}) =>
  person(id, { gender: ['woman'], sex: ['female'], ...extra });
const man = (id: string, extra = {}) =>
  person(id, { gender: ['man'], sex: ['male'], ...extra });

/** The participant and their two parents, unnamed. */
const parents = [person('ego', { isEgo: true }), woman('mum'), man('dad')];
const parentLinks = [
  link('mum', 'dad', 'partner'),
  link('mum', 'ego', 'biological'),
  link('dad', 'ego', 'biological'),
];
/** A full sibling of the participant. */
const siblingLinks = (id: string) => [
  link('mum', id, 'biological'),
  link('dad', id, 'biological'),
];

describe('generateLabels', () => {
  test('people with a kinship word of their own are given it unchanged, without the canvas’s soft hyphens', () => {
    const labels = labelsOf(
      [
        person('ego', { isEgo: true, name: 'Ari' }),
        // No gender identity: a biological mother, by sex at birth.
        person('mum', { sex: ['female'] }),
        man('dad'),
        woman('sis'),
        woman('named', { name: 'Julie' }),
      ],
      [
        link('mum', 'ego', 'biological'),
        link('dad', 'ego', 'biological'),
        link('mum', 'sis', 'biological'),
        link('dad', 'sis', 'biological'),
        link('mum', 'named', 'biological'),
        link('dad', 'named', 'biological'),
      ],
    );
    expect(labels).toEqual({
      mum: 'Biological mother',
      dad: 'Father',
      sis: 'Sister',
    });
  });

  test('the participant is never given a label, named or not', () => {
    const labels = labelsOf(parents, parentLinks);
    expect(labels).not.toHaveProperty('ego');
    expect(labels).toEqual({ mum: 'Mother', dad: 'Father' });
  });

  test('two sisters are told apart by their named partners', () => {
    expect(
      labelsOf(
        [
          ...parents,
          woman('sis1'),
          woman('sis2'),
          man('tom', { name: 'Tom' }),
          man('sam', { name: 'Sam' }),
        ],
        [
          ...parentLinks,
          ...siblingLinks('sis1'),
          ...siblingLinks('sis2'),
          link('sis1', 'tom', 'partner'),
          link('sis2', 'sam', 'partner'),
        ],
      ),
    ).toMatchObject({
      sis1: 'Sister (partner of Tom)',
      sis2: 'Sister (partner of Sam)',
    });
  });

  test('two sisters are told apart by their named children', () => {
    expect(
      labelsOf(
        [
          ...parents,
          woman('sis1'),
          woman('sis2'),
          woman('julie', { name: 'Julie' }),
          man('kim', { name: 'Kim' }),
        ],
        [
          ...parentLinks,
          ...siblingLinks('sis1'),
          ...siblingLinks('sis2'),
          link('sis1', 'julie', 'biological'),
          link('sis2', 'kim', 'biological'),
        ],
      ),
    ).toMatchObject({
      sis1: 'Sister (parent of Julie)',
      sis2: 'Sister (parent of Kim)',
    });
  });

  test('a named child is preferred to a partner known only by a kinship word', () => {
    const labels = labelsOf(
      [
        ...parents,
        woman('sis1'),
        woman('sis2'),
        man('partner1'),
        man('partner2', { name: 'Sam' }),
        woman('julie', { name: 'Julie' }),
        man('kim', { name: 'Kim' }),
      ],
      [
        ...parentLinks,
        ...siblingLinks('sis1'),
        ...siblingLinks('sis2'),
        link('sis1', 'partner1', 'partner'),
        link('sis2', 'partner2', 'partner'),
        link('sis1', 'julie', 'biological'),
        link('sis2', 'kim', 'biological'),
      ],
    );
    expect(labels).toMatchObject({
      sis1: 'Sister (parent of Julie)',
      sis2: 'Sister (parent of Kim)',
    });
  });

  test('with nobody nearby named, a relative’s own kinship word tells them apart', () => {
    expect(
      labelsOf(
        [
          ...parents,
          woman('sis1'),
          woman('sis2'),
          woman('niece'),
          man('nephew'),
        ],
        [
          ...parentLinks,
          ...siblingLinks('sis1'),
          ...siblingLinks('sis2'),
          link('sis1', 'niece', 'biological'),
          link('sis2', 'nephew', 'biological'),
        ],
      ),
    ).toMatchObject({
      sis1: 'Sister (parent of Niece)',
      sis2: 'Sister (parent of Nephew)',
      niece: 'Niece',
      nephew: 'Nephew',
    });
  });

  test('half-sisters with different named parents are told apart by them', () => {
    expect(
      labelsOf(
        [
          person('ego', { isEgo: true }),
          woman('mum'),
          man('dad'),
          woman('ana', { name: 'Ana' }),
          woman('bea', { name: 'Bea' }),
          woman('half1'),
          woman('half2'),
        ],
        [
          link('mum', 'ego', 'biological'),
          link('dad', 'ego', 'biological'),
          link('ana', 'half1', 'biological'),
          link('dad', 'half1', 'biological'),
          link('bea', 'half2', 'biological'),
          link('dad', 'half2', 'biological'),
        ],
      ),
    ).toMatchObject({
      half1: 'Half-sister (child of Ana)',
      half2: 'Half-sister (child of Bea)',
    });
  });

  test('a parent both sisters share does not tell them apart, so they are numbered', () => {
    expect(
      labelsOf(
        [
          person('ego', { isEgo: true }),
          woman('mum', { name: 'Ana' }),
          man('dad', { name: 'Bob' }),
          woman('sis1'),
          woman('sis2'),
        ],
        [...parentLinks, ...siblingLinks('sis1'), ...siblingLinks('sis2')],
      ),
    ).toEqual({ sis1: 'Sister 1', sis2: 'Sister 2' });
  });

  test('a kinship word that matches a typed name, in any case or spacing, is qualified', () => {
    expect(
      labelsOf(
        [
          ...parents,
          woman('sis'),
          woman('julie', { name: 'Julie' }),
          person('friend', { name: ' sister ' }),
        ],
        [
          ...parentLinks,
          ...siblingLinks('sis'),
          link('sis', 'julie', 'biological'),
          link('ego', 'friend', 'partner'),
        ],
      ),
    ).toMatchObject({ sis: 'Sister (parent of Julie)' });
  });

  test('the participant can tell someone apart when no one named can', () => {
    expect(
      labelsOf(
        [...parents, woman('sis'), person('friend', { name: 'Sister' })],
        [
          ...parentLinks,
          ...siblingLinks('sis'),
          link('ego', 'friend', 'partner'),
        ],
      ),
    ).toMatchObject({ sis: 'Sister (your sibling)' });
  });

  test('numbers people no relative tells apart in the order they were added, around typed names', () => {
    const labels = labelsOf(
      [
        ...parents,
        woman('c'),
        woman('a'),
        woman('b'),
        person('friend', { name: 'Sister 2' }),
      ],
      [
        ...parentLinks,
        ...siblingLinks('c'),
        ...siblingLinks('a'),
        ...siblingLinks('b'),
        link('ego', 'friend', 'partner'),
      ],
    );
    expect(labels).toMatchObject({
      c: 'Sister 1',
      a: 'Sister 3',
      b: 'Sister 4',
    });
  });

  test('family members not connected to the participant are numbered, or told apart by named partners', () => {
    expect(
      labelsOf([...parents, person('x'), person('y')], parentLinks),
    ).toMatchObject({ x: 'Family member 1', y: 'Family member 2' });
    expect(
      labelsOf(
        [
          ...parents,
          person('x'),
          person('y'),
          person('lee', { name: 'Lee' }),
          person('kai', { name: 'Kai' }),
        ],
        [
          ...parentLinks,
          link('x', 'lee', 'partner'),
          link('y', 'kai', 'partner'),
        ],
      ),
    ).toMatchObject({
      x: 'Family member (partner of Lee)',
      y: 'Family member (partner of Kai)',
    });
  });

  test('gamete framing: egg and sperm parents, and siblings told apart by partners', () => {
    expect(
      labelsOf(
        [
          ...parents,
          woman('sis'),
          man('bro'),
          man('tom', { name: 'Tom' }),
          woman('ana', { name: 'Ana' }),
        ],
        [
          ...parentLinks,
          ...siblingLinks('sis'),
          ...siblingLinks('bro'),
          link('sis', 'tom', 'partner'),
          link('bro', 'ana', 'partner'),
        ],
        'gamete',
      ),
    ).toEqual({
      mum: 'Egg parent',
      dad: 'Sperm parent',
      sis: 'Sibling (partner of Tom)',
      bro: 'Sibling (partner of Ana)',
    });
  });

  test('gendered framing: a sister and a brother keep their own words', () => {
    expect(
      labelsOf(
        [...parents, woman('sis'), man('bro')],
        [...parentLinks, ...siblingLinks('sis'), ...siblingLinks('bro')],
      ),
    ).toEqual({ mum: 'Mother', dad: 'Father', sis: 'Sister', bro: 'Brother' });
  });

  test('without gender identity, the gendered words follow sex at birth', () => {
    const nodes = [
      person('ego', { isEgo: true }),
      person('mum', { sex: ['female'] }),
      person('dad', { sex: ['male'] }),
      person('sis1', { sex: ['female'] }),
      person('sis2', { sex: ['female'] }),
      person('tom', { name: 'Tom' }),
      person('sam', { name: 'Sam' }),
    ];
    const edges = [
      ...parentLinks,
      ...siblingLinks('sis1'),
      ...siblingLinks('sis2'),
      link('sis1', 'tom', 'partner'),
      link('sis2', 'sam', 'partner'),
    ];
    expect(
      labelsOf(nodes, edges, 'gendered', configWithoutGenderIdentity),
    ).toEqual({
      mum: 'Mother',
      dad: 'Father',
      sis1: 'Sister (partner of Tom)',
      sis2: 'Sister (partner of Sam)',
    });
    // With gender identity collected but not answered, the same people take
    // neutral words.
    expect(labelsOf(nodes, edges)).toMatchObject({
      sis1: 'Sibling (partner of Tom)',
      sis2: 'Sibling (partner of Sam)',
    });
  });

  test('every label is distinct from the others and from every typed name', () => {
    const nodes = [
      person('ego', { isEgo: true, name: 'Ari' }),
      woman('mum'),
      man('dad'),
      woman('nan'),
      woman('nan2'),
      man('grandad'),
      woman('s1'),
      woman('s2'),
      woman('s3'),
      person('x'),
      person('y'),
      person('named', { name: 'Sister 1' }),
    ];
    const edges = [
      ...parentLinks,
      link('nan', 'mum', 'biological'),
      link('nan2', 'dad', 'biological'),
      link('grandad', 'dad', 'biological'),
      ...siblingLinks('s1'),
      ...siblingLinks('s2'),
      ...siblingLinks('s3'),
    ];
    for (const framing of ['gendered', 'gamete'] as const) {
      const labels = Object.values(labelsOf(nodes, edges, framing));
      const comparable = labels.map((label) => label.toLowerCase());
      expect(new Set(comparable).size).toBe(labels.length);
      expect(comparable).not.toContain('sister 1');
      expect(comparable).not.toContain('ari');
    }
  });
});

describe('labelEveryone', () => {
  const nodes = [
    person('ego', { isEgo: true, name: 'Ari' }),
    person('mum', { sex: ['female'] }),
    man('dad'),
    woman('sis1'),
    woman('sis2'),
    man('tom', { name: 'Tom' }),
    man('sam', { name: 'Sam' }),
    person('kid1'),
    person('kid2'),
  ];
  const edges = [
    link('mum', 'ego', 'biological'),
    link('dad', 'ego', 'biological'),
    link('mum', 'sis1', 'biological'),
    link('dad', 'sis1', 'biological'),
    link('mum', 'sis2', 'biological'),
    link('dad', 'sis2', 'biological'),
    link('sis1', 'tom', 'partner'),
    link('sis2', 'sam', 'partner'),
    link('ego', 'kid1', 'biological'),
    link('ego', 'kid2', 'biological'),
  ];

  test('shows each unnamed person by the label saved for them, the participant as “You” and named people by name', () => {
    const family = readFamily(nodes, edges, config);
    for (const framing of ['gendered', 'gamete'] as const) {
      const shown = labelEveryone(family, framing, intl);
      const saved = generateLabels(family, framing, intl);
      for (const [id, label] of saved) {
        // The canvas keeps only the soft hyphens a long word may break at.
        expect(shown.get(id)?.replace(/\u00AD/g, '')).toBe(label);
      }
      expect(shown.get('ego')).toBe('You');
      expect(shown.get('tom')).toBe('Tom');
      expect(shown.size).toBe(nodes.length);
    }
    expect(Object.fromEntries(labelEveryone(family, 'gendered', intl))).toEqual(
      {
        ego: 'You',
        mum: 'Bio\u00ADlogical mother',
        dad: 'Father',
        sis1: 'Sister (partner of Tom)',
        sis2: 'Sister (partner of Sam)',
        tom: 'Tom',
        sam: 'Sam',
        kid1: 'Child 1',
        kid2: 'Child 2',
      },
    );
  });

  test('someone holding a name the stage cannot read is shown by a label but never given one to save', () => {
    const family = readFamily(
      [
        person('ego', { isEgo: true }),
        woman('mum'),
        man('dad'),
        // Their name was encrypted on another stage.
        woman('sis1', { name: [181, 22, 9, 240] }),
        woman('sis2'),
        man('tom', { name: 'Tom' }),
        man('sam', { name: 'Sam' }),
      ],
      [
        ...parentLinks,
        ...siblingLinks('sis1'),
        ...siblingLinks('sis2'),
        link('sis2', 'tom', 'partner'),
        link('sis1', 'sam', 'partner'),
      ],
      config,
    );
    const saved = generateLabels(family, 'gendered', intl);
    expect(saved.has('sis1')).toBe(false);
    expect(saved.get('sis2')).toBe('Sister (partner of Tom)');
    expect(labelEveryone(family, 'gendered', intl).get('sis1')).toBe(
      'Sister (partner of Sam)',
    );
  });
});

describe('encrypted names', () => {
  const ciphertext = (seed: number) => [seed, 22, 9, 240, 77, 3];

  test('a decrypted typed name is shown, and no label repeats it', () => {
    const family = readFamily(
      [
        person('ego', { isEgo: true }),
        woman('mum'),
        man('dad'),
        // Typed as "Sister", and stored encrypted.
        woman('sis1', { name: ciphertext(1) }),
        woman('sis2'),
        man('tom', { name: 'Tom' }),
      ],
      [
        ...parentLinks,
        ...siblingLinks('sis1'),
        ...siblingLinks('sis2'),
        link('sis2', 'tom', 'partner'),
      ],
      config,
      {},
      new Map([['sis1', 'Sister']]),
    );
    expect(labelEveryone(family, 'gendered', intl).get('sis1')).toBe('Sister');
    expect(generateLabels(family, 'gendered', intl).get('sis2')).toBe(
      'Sister (partner of Tom)',
    );
  });

  test('a label already held, read through decryption, is kept rather than written again', () => {
    const family = readFamily(
      [
        person('ego', { isEgo: true }),
        woman('mum', { name: ciphertext(1) }),
        man('dad', { name: ciphertext(2) }),
        woman('sis'),
      ],
      [...parentLinks, ...siblingLinks('sis')],
      config,
      {
        mum: nameFingerprint(ciphertext(1)),
        dad: nameFingerprint(ciphertext(2)),
      },
    );
    const labels = generateLabels(family, 'gendered', intl);
    expect(Object.fromEntries(labels)).toEqual({
      mum: 'Mother',
      dad: 'Father',
      sis: 'Sister',
    });
    // The mother's stored label still reads "Mother"; the father's was saved
    // under another framing, and the sister has none.
    const decrypted = new Map([
      ['mum', 'Mother'],
      ['dad', 'Sperm parent'],
    ]);
    const { held, toWrite } = labelWrites(family, labels, 'name', decrypted);
    expect(Object.fromEntries(held)).toEqual({ mum: ciphertext(1) });
    expect(Object.fromEntries(toWrite)).toEqual({
      dad: 'Father',
      sis: 'Sister',
    });
    // Without the decrypted text, nothing encrypted can be known to be held.
    expect([
      ...labelWrites(family, labels, 'name', new Map()).toWrite.keys(),
    ]).toEqual(['mum', 'dad', 'sis']);
  });

  test('a label held as text is kept', () => {
    const family = readFamily(
      [person('ego', { isEgo: true }), woman('mum', { name: 'Mother' })],
      [link('mum', 'ego', 'biological')],
      config,
      { mum: nameFingerprint('Mother') },
    );
    const labels = generateLabels(family, 'gendered', intl);
    expect(
      Object.fromEntries(labelWrites(family, labels, 'name', new Map()).held),
    ).toEqual({ mum: 'Mother' });
  });
});

describe('soft hyphens', () => {
  test('saved labels never carry the soft hyphens the canvas shows', () => {
    const family = readFamily(
      [
        person('ego', { isEgo: true }),
        woman('mum'),
        woman('nan'),
        man('sam', { name: 'Sam' }),
        woman('sd1'),
        woman('sd2'),
        man('tom', { name: 'Tom' }),
        man('al', { name: 'Al' }),
      ],
      [
        link('mum', 'ego', 'biological'),
        link('nan', 'mum', 'biological'),
        link('ego', 'sam', 'partner'),
        link('sam', 'sd1', 'biological'),
        link('sam', 'sd2', 'biological'),
        link('sd1', 'tom', 'partner'),
        link('sd2', 'al', 'partner'),
      ],
      config,
    );
    const shown = labelEveryone(family, 'gendered', intl);
    const saved = generateLabels(family, 'gendered', intl);
    // The canvas breaks long kinship words at their soft hyphens.
    expect(shown.get('nan')).toBe('Maternal grand­mother');
    expect(shown.get('sd1')).toBe('Step­daughter (partner of Tom)');
    // What is saved reads the same, without them.
    expect(Object.fromEntries(saved)).toMatchObject({
      nan: 'Maternal grandmother',
      sd1: 'Stepdaughter (partner of Tom)',
    });
    for (const label of saved.values()) {
      expect(label).not.toContain('­');
    }
    expect(saved.get('sd2')).toBe('Stepdaughter (partner of Al)');
  });
});
