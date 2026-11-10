import { describe, expect, it } from 'vitest';

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
 * Text schema 8 accepted empty or made of spaces must not stop a protocol
 * migrating: every string that becomes localized text is blanked in turn,
 * and the protocol must still migrate to a valid schema 9 protocol.
 */
describe.each(FIXTURES)('blank text in %s', (_name, fixture) => {
  const document = fixture();
  const sites = textSites(document);
  const found = sites.map((at) => at.join('.'));

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

  it.each(BLANKS)('migrates with any one text set to %j', (blank) => {
    const failures: string[] = [];
    for (const at of sites) {
      const blanked = structuredClone(document);
      setAt(blanked, at, blank);
      if (!ProtocolSchemaV8.safeParse(blanked).success) continue;
      try {
        migrateProtocol(blanked, 9);
      } catch (error) {
        failures.push(`${at.join('.')}: ${String(error).slice(0, 300)}`);
      }
    }
    expect(failures).toEqual([]);
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

  it.each(BLANKS)('asks a prompt with the stage name for %j', (blank) => {
    const migrated = migrateWith(['stages', 6, 'prompts', 0, 'text'], blank);
    const stage = stageWithId(migrated, stageIdAt(6));
    expect(getAt(stage, ['prompts', 0, 'text'])).toEqual(stage.label);
  });

  it('asks a prompt with the backfilled stage name when both are blank', () => {
    const document = structuredClone(ecoGeneticTemplate);
    setAt(document, ['stages', 6, 'label'], ' ');
    setAt(document, ['stages', 6, 'prompts', 0, 'text'], '');
    const stage = stageWithId(migrateProtocol(document, 9), stageIdAt(6));
    expect(getAt(stage, ['prompts', 0, 'text'])).toEqual({ en: 'Stage 7' });
  });

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

  it('reads "Option" and its position when the value is blank too', () => {
    const migrated = protocolWith({
      type: 'categorical',
      options: [
        { label: 'Often', value: 'often' },
        { label: ' ', value: ' ' },
      ],
    });
    expect(labelsOf(migrated)).toEqual([{ en: 'Often' }, { en: 'Option 2' }]);
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
});
