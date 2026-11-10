import { describe, expect, it } from 'vitest';

import { escapeMessageText } from '../../../localization/messageSyntax.ts';
import { MigrationResultInvalidError } from '../../../migration/errors.ts';
import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import { collectLocalizedStringSites } from '../../../utils/collectLocalizedStrings.ts';
import ProtocolSchemaV8 from '../../8/schema.ts';
import migrationV8toV9 from '../migration.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { suppliedStageSettingPaths } from '../supplied-stage-text.ts';
import { completeProtocol } from './complete-localized-protocol.ts';
import ecoGeneticTemplate from './fixtures/eco-genetic-relationship-maps.schema-8.json';
import { asSchema8Protocol } from './schema-8-protocol.ts';

type Path = readonly (string | number)[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getAt = (root: unknown, at: Path): unknown =>
  at.reduce<unknown>(
    (node, key) =>
      typeof node === 'object' && node !== null
        ? Reflect.get(node, key)
        : undefined,
    root,
  );

const setAt = (root: unknown, at: Path, value: unknown): void => {
  const parent = getAt(root, at.slice(0, -1));
  const key = at.at(-1);
  if (typeof parent !== 'object' || parent === null || key === undefined) {
    throw new Error(`No value at ${JSON.stringify(at)}`);
  }
  Reflect.set(parent, key, value);
};

/** The path of every string in a document. */
const stringPaths = (value: unknown, at: Path = []): Path[] => {
  if (typeof value === 'string') return [at];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => stringPaths(item, [...at, index]));
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, item]) =>
      stringPaths(item, [...at, key]),
    );
  }
  return [];
};

const startsWith = (at: Path, prefix: Path) =>
  prefix.every((key, index) => at[index] === key);

/**
 * The complete protocol as schema 8 held it. Schema 8 had none of the stage
 * settings whose wording Network Canvas supplies: the migration adds them.
 */
const completeSchema8Protocol = () => {
  const document = asSchema8Protocol(completeProtocol());
  for (const stage of document.stages) {
    if (typeof stage.type !== 'string') continue;
    for (const path of suppliedStageSettingPaths(stage.type)) {
      const parent = getAt(stage, path.slice(0, -1));
      const key = path.at(-1);
      if (isRecord(parent) && key !== undefined) {
        Reflect.deleteProperty(parent, key);
      }
    }
  }
  return document;
};

const FIXTURES = [
  ['every interface', completeSchema8Protocol],
  ['the CEGRM template', () => structuredClone(ecoGeneticTemplate)],
] as const;

/**
 * The strings of a schema 8 document that become localized text in schema 9,
 * found from what the migration does rather than from a list: each string in
 * turn is replaced with a word of its own, and is one when that word then
 * shows only in the migrated protocol's localized text. A name or id the
 * migration copies into text is also still a name or id, so it is not one.
 */
const textSites = (document: unknown): Path[] =>
  stringPaths(document).filter((at, index) => {
    const marked = structuredClone(document);
    const word = `zqx${index}zqx`;
    setAt(marked, at, word);
    let migrated: unknown;
    try {
      migrated = migrationV8toV9.migrate(ProtocolSchemaV8.parse(marked), {});
    } catch {
      return false;
    }
    const sites = collectLocalizedStringSites(ProtocolSchemaV9, migrated).map(
      ({ path }) => path,
    );
    const holding = stringPaths(migrated).filter((path) => {
      const text = getAt(migrated, path);
      return typeof text === 'string' && text.includes(word);
    });
    return (
      holding.length > 0 &&
      holding.every((path) => sites.some((site) => startsWith(path, site)))
    );
  });

const BLANKS = ['', ' '] as const;

/**
 * What becomes of each kind of text schema 8 accepted blank. A title or label
 * is display text, so the migration repairs it (or leaves out optional text
 * that said nothing). A prompt or question is the instrument's own content,
 * which the migration never invents, so the document is refused at that place.
 */
type Outcome = 'repaired' | 'refused';

/** Text within a stage, by its path below the stage. */
const STAGE_TEXT: readonly (readonly [RegExp, Outcome])[] = [
  // Stage names, side panel titles, roster card and sort labels, and
  // condition labels.
  [/^label$/, 'repaired'],
  [/^panels\.\d+\.title$/, 'repaired'],
  [/^cardOptions\.additionalProperties\.\d+\.label$/, 'repaired'],
  [/^sortOptions\.sortableProperties\.\d+\.label$/, 'repaired'],
  [/^diseases\.\d+\.label$/, 'repaired'],
  // Other titles and labels, given a default.
  [/^title$/, 'repaired'],
  [/^form\.title$/, 'repaired'],
  [/^introductionPanel\.title$/, 'repaired'],
  [/^presets\.\d+\.label$/, 'repaired'],
  [/^prompts\.\d+\.negativeLabel$/, 'repaired'],
  [/^prompts\.\d+\.otherOptionLabel$/, 'repaired'],
  [/^explanationText\.(title|body)$/, 'repaired'],
  [/^(nodeForm|edges\.\d+\.form)\.fields\.\d+\.label$/, 'repaired'],
  // Optional text, left out when it says nothing.
  [/(^|\.)hint$/, 'repaired'],
  [/^introductionPanel\.text$/, 'repaired'],
  [/^(introScreen\.)?items\.\d+\.(content|description)$/, 'repaired'],
  [/\.parameters\.(min|max)Label$/, 'repaired'],
  // Prompts and questions.
  [/^prompts\.\d+\.text$/, 'refused'],
  [/^(prompt|censusPrompt)$/, 'refused'],
  [/^nominationPrompts\.\d+\.text$/, 'refused'],
  [/^(form\.fields|nodeConfig\.form)\.\d+\.prompt$/, 'refused'],
  [/^prompts\.\d+\.otherVariablePrompt$/, 'refused'],
];

/** Text within the codebook: option labels with a value, scale end labels. */
const CODEBOOK_TEXT: readonly (readonly [RegExp, Outcome])[] = [
  [/\.options\.\d+\.label$/, 'repaired'],
  [/\.parameters\.(min|max)Label$/, 'repaired'],
];

const outcomeOf = (at: Path): Outcome | undefined => {
  const [root, , ...below] = at;
  const [table, rest] =
    root === 'stages'
      ? [STAGE_TEXT, below.join('.')]
      : [CODEBOOK_TEXT, at.join('.')];
  return table.find(([pattern]) => pattern.test(rest))?.[1];
};

/**
 * Where schema 9 reports a site of a schema 8 document: the same place in
 * the migrated document. A stage keeps its id, though the migration can add
 * stages before it, and the pedigree conversion renames two of its fields.
 */
const migratedPathOf = (document: unknown, migrated: unknown, at: Path) => {
  if (at[0] !== 'stages') return at;
  const id = getAt(document, ['stages', at[1] ?? -1, 'id']);
  const stages = getAt(migrated, ['stages']);
  const index = Array.isArray(stages)
    ? stages.findIndex((stage) => isRecord(stage) && stage.id === id)
    : -1;
  const below = at
    .slice(2)
    .join('.')
    .replace(/^censusPrompt$/, 'prompt')
    .replace(/^nodeConfig\.form\./, 'form.fields.')
    .split('.')
    .map((key) => (/^\d+$/.test(key) ? Number(key) : key));
  return ['stages', index, ...below];
};

/** The places schema 9 reports when a migration fails. */
const issuePathsOf = (run: () => unknown): Path[] => {
  try {
    run();
  } catch (error) {
    if (error instanceof MigrationResultInvalidError) {
      return error.issues.map(({ path }) => path);
    }
    throw error;
  }
  return [];
};

/**
 * Every string of a complete schema 8 protocol that becomes localized text is
 * blanked in turn. Where schema 8 accepted the result, the protocol migrates
 * to a valid schema 9 protocol if the text is a title or label, and is
 * refused, at that text, if it is a prompt or question.
 */
describe.each(FIXTURES)('blank text in %s', (_name, fixture) => {
  const document = fixture();
  const sites = textSites(document);
  const found = sites.map((at) => at.join('.'));
  const migrated = migrateProtocol(structuredClone(document), 9);

  // The sweep finds its sites itself, so it is checked to find the families
  // it guards; a sweep that found nothing would pass vacuously.
  it('finds the text in the protocol', () => {
    expect(found).toContainEqual(expect.stringMatching(/^stages\.\d+\.label$/));
    expect(found).toContainEqual(
      expect.stringMatching(/^stages\.\d+\.prompts\.\d+\.text$/),
    );
    expect(found).toContainEqual(
      expect.stringMatching(/^stages\.\d+\.panels\.\d+\.title$/),
    );
    expect(found).toContainEqual(
      expect.stringMatching(/^stages\.\d+\.diseases\.\d+\.label$/),
    );
    expect(found).toContainEqual(
      expect.stringMatching(/^codebook\..+\.options\.\d+\.label$/),
    );
  });

  // A kind of text the tables do not name has had no decision made for it.
  it('expects an outcome for every text it finds', () => {
    expect(found.filter((_, index) => !outcomeOf(sites[index] ?? []))).toEqual(
      [],
    );
  });

  // One test per text, so each stays short and a failure names its text.
  describe.each(BLANKS)('with one text set to %j', (blank) => {
    it.each(
      sites.map(
        (at) => [at.join('.'), outcomeOf(at) ?? 'repaired', at] as const,
      ),
    )('%s is %s', (_site, outcome, at) => {
      const blanked = structuredClone(document);
      setAt(blanked, at, blank);
      // Only text schema 8 accepted blank is held to an outcome.
      if (!ProtocolSchemaV8.safeParse(blanked).success) return;
      if (outcome === 'repaired') {
        expect(() => migrateProtocol(blanked, 9)).not.toThrow();
        return;
      }
      const expected = migratedPathOf(document, migrated, at);
      const paths = issuePathsOf(() => migrateProtocol(blanked, 9));
      expect(paths).not.toEqual([]);
      expect(
        paths.every((path) => startsWith(path, expected)),
        `expected every issue at ${expected.join('.')}, got ${JSON.stringify(paths)}`,
      ).toBe(true);
    });
  });
});

/**
 * Content a schema 8 document can leave blank that the migration never
 * invents: an option's value, whose meaning cannot be known, and the name of
 * a node type, edge type or attribute. The document is refused at that place.
 */
describe('blank content the migration does not invent', () => {
  const closeness = ['codebook', 'node', 'person', 'variables', 'closeness'];
  const SITES: readonly (readonly [string, Path])[] = [
    ['an ordinal option value', [...closeness, 'options', 1, 'value']],
    [
      'a categorical option value',
      [
        'codebook',
        'node',
        'person',
        'variables',
        'tie_type',
        'options',
        0,
        'value',
      ],
    ],
    ['a node type name', ['codebook', 'node', 'person', 'name']],
    ['an edge type name', ['codebook', 'edge', 'knows', 'name']],
    ['a node attribute name', [...closeness, 'name']],
    [
      'an edge attribute name',
      [
        'codebook',
        'edge',
        'family_relationship',
        'variables',
        'gameteRole',
        'name',
      ],
    ],
    [
      'an ego attribute name',
      ['codebook', 'ego', 'variables', 'participant_consent', 'name'],
    ],
  ];

  describe.each(SITES)('%s', (_name, at) => {
    // So the case below blanks something the fixture holds.
    it('is in the fixture', () => {
      expect(['string', 'number']).toContain(
        typeof getAt(ecoGeneticTemplate, at),
      );
    });

    it.each(BLANKS)('set to %j is refused at that place', (blank) => {
      const document = structuredClone(ecoGeneticTemplate);
      setAt(document, at, blank);
      expect(ProtocolSchemaV8.safeParse(document).success).toBe(true);
      const paths = issuePathsOf(() => migrateProtocol(document, 9));
      expect(paths).toContainEqual(at);
    });
  });
});

describe('the text given to blank schema 8 text', () => {
  const migrateWith = (at: Path, blank: string) => {
    const document = structuredClone(ecoGeneticTemplate);
    setAt(document, at, blank);
    return migrateProtocol(document, 9);
  };

  const stageWithId = (protocol: unknown, id: string) => {
    const stages = getAt(protocol, ['stages']);
    const stage = Array.isArray(stages)
      ? stages.find((candidate) => isRecord(candidate) && candidate.id === id)
      : undefined;
    if (!isRecord(stage)) throw new Error(`No stage "${id}"`);
    return stage;
  };

  const stageIdAt = (index: number) => {
    const id = getAt(ecoGeneticTemplate, ['stages', index, 'id']);
    if (typeof id !== 'string') throw new Error(`No stage at ${index}`);
    return id;
  };

  it.each(BLANKS)(
    'names a stage "Stage" and its schema 8 position for %j',
    (blank) => {
      const migrated = migrateWith(['stages', 5, 'label'], blank);
      expect(stageWithId(migrated, stageIdAt(5)).label).toEqual({
        en: 'Stage 6',
      });
    },
  );

  it.each(BLANKS)('titles a side panel by its position for %j', (blank) => {
    const migrated = migrateWith(['stages', 5, 'panels', 0, 'title'], blank);
    expect(
      getAt(stageWithId(migrated, stageIdAt(5)), ['panels', 0, 'title']),
    ).toEqual({ en: 'Panel 1' });
  });

  it.each(BLANKS)(
    'labels a condition with its attribute name for %j',
    (blank) => {
      const migrated = migrateWith(
        ['stages', 12, 'diseases', 0, 'label'],
        blank,
      );
      const stage = stageWithId(migrated, stageIdAt(12));
      const attribute = getAt(stage, ['diseases', 0, 'attribute']);
      const source = stageWithId(migrated, String(stage.sourceStageId));
      const type = getAt(source, ['subject', 'type']);
      expect(typeof attribute).toBe('string');
      expect(getAt(stage, ['diseases', 0, 'label'])).toEqual({
        en: getAt(migrated, [
          'codebook',
          'node',
          String(type),
          'variables',
          String(attribute),
          'name',
        ]),
      });
    },
  );

  it.each(BLANKS)('labels an ordinal option with its value for %j', (blank) => {
    const options = [
      'codebook',
      'node',
      'person',
      'variables',
      'closeness',
      'options',
    ];
    const value = getAt(ecoGeneticTemplate, [...options, 1, 'value']);
    const migrated = migrateWith([...options, 1, 'label'], blank);
    expect(getAt(migrated, [...options, 1, 'label'])).toEqual({
      en: String(value),
    });
    // The value an answer records is unchanged.
    expect(getAt(migrated, [...options, 1, 'value'])).toEqual(value);
  });
});

describe('option labels that show nothing', () => {
  const protocolWith = (variable: Record<string, unknown>) => {
    const document = asSchema8Protocol(completeProtocol());
    setAt(document, ['codebook', 'node', 'person', 'variables', 'blanks'], {
      name: 'blanks',
      ...variable,
    });
    return migrateProtocol(document, 9);
  };

  const labelsOf = (protocol: unknown) => {
    const options = getAt(protocol, [
      'codebook',
      'node',
      'person',
      'variables',
      'blanks',
      'options',
    ]);
    return Array.isArray(options)
      ? options.map((option: unknown) => getAt(option, ['label']))
      : [];
  };

  it('reads "Yes" and "No" on a Boolean choice', () => {
    const migrated = protocolWith({
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: ' ', value: true },
        { label: '', value: false },
      ],
    });
    expect(labelsOf(migrated)).toEqual([{ en: 'Yes' }, { en: 'No' }]);
  });

  it('reads as the value, escaped to show as written', () => {
    const migrated = protocolWith({
      type: 'categorical',
      options: [
        { label: '', value: '*Often*' },
        { label: ' ', value: 2 },
      ],
    });
    expect(labelsOf(migrated)).toEqual([{ en: '\\*Often\\*' }, { en: '2' }]);
  });

  // The migration does not invent what an option means, so neither its value
  // nor its label is supplied, and the document is refused at the value.
  it('is refused at the value when the value is blank too', () => {
    const variable = ['codebook', 'node', 'person', 'variables', 'blanks'];
    const document = asSchema8Protocol(completeProtocol());
    setAt(document, variable, {
      name: 'blanks',
      type: 'categorical',
      options: [
        { label: 'Often', value: 'often' },
        { label: ' ', value: ' ' },
      ],
    });
    expect(issuePathsOf(() => migrateProtocol(document, 9))).toContainEqual([
      ...variable,
      'options',
      1,
      'value',
    ]);
  });
});

describe('roster property labels that show nothing', () => {
  it.each([
    ['card', ['cardOptions', 'additionalProperties']],
    ['sort', ['sortOptions', 'sortableProperties']],
  ] as const)('read the %s attribute name', (_name, list) => {
    const document = asSchema8Protocol(completeProtocol());
    const index = document.stages.findIndex(
      (stage) => stage.type === 'NameGeneratorRoster',
    );
    const label = ['stages', index, ...list, 0, 'label'];
    const variable = getAt(document, ['stages', index, ...list, 0, 'variable']);
    setAt(document, label, ' ');
    const migrated = migrateProtocol(document, 9);
    expect(getAt(migrated, label)).toEqual({
      en: getAt(document, [
        'codebook',
        'node',
        'person',
        'variables',
        String(variable),
        'name',
      ]),
    });
  });
});

describe('condition labels that show nothing', () => {
  it('are numbered when another condition already has the name', () => {
    const document = structuredClone(ecoGeneticTemplate);
    const diseases = ['stages', 12, 'diseases'];
    const first = getAt(document, [...diseases, 0]);
    if (!isRecord(first)) throw new Error('No condition');
    // A second condition that shows nothing, whose attribute's name the
    // first condition already shows.
    setAt(document, [...diseases, 0, 'label'], 'had_testing');
    setAt(document, [...diseases, 1], {
      ...structuredClone(first),
      id: 'second-condition',
      label: ' ',
      variable: 'had_testing',
    });
    const stages = getAt(migrateProtocol(document, 9), ['stages']);
    const stage = Array.isArray(stages)
      ? stages.find(
          (candidate) =>
            isRecord(candidate) && candidate.id === 'narrative-pedigree',
        )
      : undefined;
    expect(getAt(stage, ['diseases', 1, 'label'])).toEqual({
      en: 'had_testing 2',
    });
  });

  // Fresco re-runs this migration over rows already in schema 9 form, where
  // a label is a message: `Type '{'A'}'` shows the participant `Type {A}`.
  it('are numbered when another already shows the name, in schema 9 form', () => {
    const document = structuredClone(ecoGeneticTemplate);
    const diseases = ['stages', 12, 'diseases'];
    const first = getAt(document, [...diseases, 0]);
    if (!isRecord(first)) throw new Error('No condition');
    Reflect.set(document, 'localization', {
      defaultLocale: 'en',
      locales: ['en'],
    });
    setAt(
      document,
      ['codebook', 'node', 'person', 'variables', 'had_testing', 'name'],
      'Type {A}',
    );
    setAt(document, [...diseases, 0, 'label'], {
      en: escapeMessageText('Type {A}'),
    });
    setAt(document, [...diseases, 1], {
      ...structuredClone(first),
      id: 'second-condition',
      label: { en: ' ' },
      variable: 'had_testing',
    });
    const stages = getAt(migrateProtocol(document, 9), ['stages']);
    const stage = Array.isArray(stages)
      ? stages.find(
          (candidate) =>
            isRecord(candidate) && candidate.id === 'narrative-pedigree',
        )
      : undefined;
    expect(getAt(stage, ['diseases', 1, 'label'])).toEqual({
      en: escapeMessageText('Type {A} 2'),
    });
  });
});
