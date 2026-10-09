import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { MigrationResultInvalidError } from '../../../migration/errors.ts';
import {
  getMigrationInfo,
  migrateProtocol,
} from '../../../migration/migrate-protocol.ts';
import { createBaseProtocol, localized } from '../../../utils/test-utils.ts';
import validateProtocol from '../../../validation/validate-protocol.ts';
import ProtocolSchemaV8 from '../../8/schema.ts';
import migrationV8toV9 from '../migration.ts';
import ProtocolSchemaV9 from '../schema.ts';
import { asSchema8Protocol } from './schema-8-protocol.ts';

// The base protocol with its `person.name` attribute marked encrypted, under
// the given experiments.
const protocolWithEncryptedName = (
  experiments: Partial<Record<string, boolean>> | undefined,
) => {
  const base = createBaseProtocol();
  const { person } = base.codebook.node;
  return {
    ...base,
    ...(experiments !== undefined && { experiments }),
    codebook: {
      ...base.codebook,
      node: {
        ...base.codebook.node,
        person: {
          ...person,
          variables: {
            ...person.variables,
            name: { ...person.variables.name, encrypted: true },
          },
        },
      },
    },
  };
};

// The same protocol as schema 8 stored it.
const schema8WithEncryptedName = (
  experiments: Partial<Record<string, boolean>> | undefined,
) => asSchema8Protocol(protocolWithEncryptedName(experiments));

// The base protocol, never encrypted, as the migration leaves it.
const migratedBase = () =>
  migrateProtocol(asSchema8Protocol(createBaseProtocol()), 9);

describe('Migrating encrypted attributes from schema 8 to 9', () => {
  it('keeps them encrypted when the experiment was on, and drops the experiment', () => {
    const migrated = migrateProtocol(
      schema8WithEncryptedName({ encryptedVariables: true }),
      9,
    );

    expect(migrated.codebook.node?.person?.variables?.name).toMatchObject({
      encrypted: true,
    });
    expect(migrated.experiments).toStrictEqual({});
    expect(ProtocolSchemaV9.safeParse(migrated).success).toBe(true);
  });

  // The schema 8 alpha named the experiment `encryptNames`, and its runtime
  // encrypted marked attributes while it was on.
  it('keeps them encrypted when the alpha flag was on, and drops the flag', () => {
    const migrated = migrateProtocol(
      schema8WithEncryptedName({ encryptNames: true }),
      9,
    );

    expect(migrated.codebook.node?.person?.variables?.name).toMatchObject({
      encrypted: true,
    });
    expect(migrated.experiments).toStrictEqual({});
    expect(ProtocolSchemaV9.safeParse(migrated).success).toBe(true);
  });

  it.each([
    ['empty', {}],
    ['off', { encryptedVariables: false }],
    ['off under its alpha name', { encryptNames: false }],
    [
      'off, whatever its alpha name said',
      { encryptedVariables: false, encryptNames: true },
    ],
  ])(
    'unmarks them when the experiment was %s, since they were never encrypted',
    (_description, experiments) => {
      const migrated = migrateProtocol(
        schema8WithEncryptedName(experiments),
        9,
      );

      expect(migrated.codebook.node?.person?.variables?.name).toEqual(
        migratedBase().codebook.node?.person?.variables?.name,
      );
      expect(migrated.experiments).toStrictEqual({});
      expect(ProtocolSchemaV9.safeParse(migrated).success).toBe(true);
    },
  );

  it('unmarks them when the protocol had no experiments, and adds none', () => {
    const migrated = migrateProtocol(schema8WithEncryptedName(undefined), 9);

    expect(migrated.codebook.node?.person?.variables?.name).toEqual(
      migratedBase().codebook.node?.person?.variables?.name,
    );
    expect(Object.hasOwn(migrated, 'experiments')).toBe(false);
    expect(ProtocolSchemaV9.safeParse(migrated).success).toBe(true);
  });

  it('changes nothing else in the codebook', () => {
    const migrated = migrateProtocol(schema8WithEncryptedName(undefined), 9);

    expect(migrated.codebook).toEqual(migratedBase().codebook);
  });
});

describe('The experiments setting', () => {
  it('keeps every experiment but encrypted attributes when migrating from schema 8', () => {
    const migrated = migrationV8toV9.migrate(
      schema8WithEncryptedName({
        encryptedVariables: true,
        laterFeature: true,
      }),
      {},
    );

    expect(migrated.experiments).toStrictEqual({ laterFeature: true });
  });

  it('is still accepted by schema 8 with encrypted attributes turned on', () => {
    const protocol = schema8WithEncryptedName({ encryptedVariables: true });
    expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(true);
  });

  it('is accepted by schema 9', () => {
    const protocol = withFinishStage({
      ...protocolWithEncryptedName({}),
      schemaVersion: 9,
    });

    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
  });

  it.each([
    [
      'encrypted attributes, which are no longer experimental',
      'encryptedVariables',
    ],
    ['an experiment schema 9 does not define', 'laterFeature'],
  ])('is refused by schema 9 when it turns on %s', (_description, key) => {
    const protocol = {
      ...protocolWithEncryptedName(undefined),
      experiments: { [key]: true },
      schemaVersion: 9,
    };
    const result = ProtocolSchemaV9.safeParse(protocol);

    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        code: 'unrecognized_keys',
        keys: [key],
        path: ['experiments'],
      }),
    );
  });

  it('is not needed by schema 9 to keep an attribute encrypted', () => {
    const protocol = protocolWithEncryptedName(undefined);
    expect(
      ProtocolSchemaV9.safeParse(
        withFinishStage({ ...protocol, schemaVersion: 9 }),
      ).success,
    ).toBe(true);
  });
});

const protocolWithPassphraseRules = (
  validation: { minLength?: number; maxLength?: number } | undefined,
) => {
  const base = createBaseProtocol();
  return {
    ...base,
    stages: [
      ...base.stages,
      {
        id: 'anonymisation',
        type: 'Anonymisation' as const,
        label: localized('Anonymisation'),
        explanationText: {
          title: localized('Privacy'),
          body: localized('Choose a passphrase.'),
        },
        ...(validation !== undefined && { validation }),
      },
    ],
  };
};

// The same protocol as schema 8 stored it.
const schema8WithPassphraseRules = (
  validation: { minLength?: number; maxLength?: number } | undefined,
) => asSchema8Protocol(protocolWithPassphraseRules(validation));

describe('Migrating passphrase length rules from schema 8 to 9', () => {
  it('removes both lengths when the minimum is longer than the maximum', () => {
    const migrated = migrateProtocol(
      schema8WithPassphraseRules({ minLength: 9, maxLength: 6 }),
      9,
    );

    // No passphrase could meet both, so neither is kept and the interview's
    // default applies. Every stage stays, in its order.
    expect(migrated.stages).toEqual(
      migrateProtocol(schema8WithPassphraseRules(undefined), 9).stages,
    );
  });

  it.each([
    { minLength: 4, maxLength: 12 },
    { minLength: 6, maxLength: 6 },
    { maxLength: 6 },
    { minLength: 10 },
  ])('keeps %j, which a passphrase can meet', (validation) => {
    const migrated = migrateProtocol(schema8WithPassphraseRules(validation), 9);

    expect(
      migrated.stages.find(({ type }) => type === 'Anonymisation'),
    ).toMatchObject({ validation });
  });

  it('says so in the migration notes', () => {
    const note = getMigrationInfo(8).notes.find(({ version }) => version === 9);

    expect(note?.notes).toContain(
      'If an Anonymisation stage required a minimum passphrase length longer than its maximum',
    );
  });
});

const nodeRule = (id: string, attribute: string, value: string | number) => ({
  type: 'node' as const,
  id,
  options: {
    type: 'person',
    attribute,
    operator: typeof value === 'number' ? 'GREATER_THAN' : 'EXACTLY',
    value,
  },
});

const nameRule = nodeRule('rule-name', 'name', 'Alice');
const ageRule = nodeRule('rule-age', 'age', 18);

const presenceRule = (operator: 'EXISTS' | 'NOT_EXISTS') => ({
  type: 'node' as const,
  id: `rule-${operator}`,
  options: { type: 'person', attribute: 'name', operator },
});

// The name generator's panel over the interview's own network.
const networkPanel = (filter: object) => ({
  id: 'panel-network',
  title: localized('People already named'),
  dataSource: 'existing',
  filter,
});

// A protocol with an encrypted `person.name`, and rules on it in the name
// generator's skip logic, both of its panels and the sociogram's filter.
const protocolWithRulesOnEncryptedName = (
  experiments: { encryptedVariables?: boolean } | undefined,
) => {
  const protocol = protocolWithEncryptedName(experiments);
  const [nameGenerator, sociogram] = protocol.stages;
  return {
    ...protocol,
    assetManifest: {
      'previous-people': {
        id: 'previous-people',
        type: 'network',
        name: 'Previous people',
        source: 'previous-people.csv',
      },
    },
    stages: [
      {
        ...nameGenerator,
        skipLogic: { action: 'SKIP', filter: { rules: [nameRule] } },
        panels: [
          networkPanel({ join: 'AND', rules: [nameRule, ageRule] }),
          {
            id: 'panel-external',
            title: localized('People from before'),
            dataSource: 'previous-people',
            filter: { rules: [nameRule] },
          },
        ],
      },
      { ...sociogram, filter: { rules: [nameRule] } },
    ],
  };
};

describe('Migrating rules on encrypted attributes from schema 8 to 9', () => {
  it('removes them while the attribute stays encrypted, with any filter or skip logic left empty', () => {
    const [nameGenerator, sociogram] = migrateProtocol(
      asSchema8Protocol(
        protocolWithRulesOnEncryptedName({ encryptedVariables: true }),
      ),
      9,
    ).stages;

    expect(nameGenerator).not.toHaveProperty('skipLogic');
    expect(nameGenerator).toMatchObject({
      panels: [
        { filter: { join: 'AND', rules: [ageRule] } },
        // The external file's rows are not encrypted, so its rule still works.
        { filter: { rules: [nameRule] } },
      ],
    });
    expect(sociogram).not.toHaveProperty('filter');
  });

  it('keeps them when the experiment was off, because the attribute is no longer encrypted', () => {
    const [nameGenerator, sociogram] = migrateProtocol(
      asSchema8Protocol(protocolWithRulesOnEncryptedName(undefined)),
      9,
    ).stages;

    expect(nameGenerator).toMatchObject({
      skipLogic: { action: 'SKIP', filter: { rules: [nameRule] } },
      panels: [
        { filter: { join: 'AND', rules: [nameRule, ageRule] } },
        { filter: { rules: [nameRule] } },
      ],
    });
    expect(sociogram).toMatchObject({ filter: { rules: [nameRule] } });
  });

  // Encryption turns an answer into another string and leaves an unanswered
  // attribute without a value, so these rules read the same under schema 8.
  it('keeps rules that only ask whether the encrypted attribute is answered', () => {
    const protocol = protocolWithRulesOnEncryptedName({
      encryptedVariables: true,
    });
    const [nameGenerator, sociogram] = protocol.stages;
    const answered = presenceRule('EXISTS');
    const unanswered = presenceRule('NOT_EXISTS');

    const migrated = migrateProtocol(
      asSchema8Protocol({
        ...protocol,
        stages: [
          {
            ...nameGenerator,
            skipLogic: { action: 'SKIP', filter: { rules: [answered] } },
            panels: [
              networkPanel({ join: 'AND', rules: [nameRule, unanswered] }),
            ],
          },
          {
            ...sociogram,
            filter: { join: 'OR', rules: [answered, nameRule] },
          },
        ],
      }),
      9,
    );
    const [migratedNameGenerator, migratedSociogram] = migrated.stages;

    expect(migratedNameGenerator).toMatchObject({
      skipLogic: { action: 'SKIP', filter: { rules: [answered] } },
      panels: [{ filter: { join: 'AND', rules: [unanswered] } }],
    });
    expect(migratedSociogram).toMatchObject({
      filter: { join: 'OR', rules: [answered] },
    });
  });

  // Schema 8 already refused a filter with no rules, so one the migration did
  // not empty is left for validation to report rather than removed unseen.
  it.each([
    ['on', { encryptedVariables: true }],
    ['off', undefined],
  ])(
    'leaves a filter or skip logic that already had no rules, with the experiment %s',
    (_, experiments) => {
      const protocol = protocolWithRulesOnEncryptedName(experiments);
      const [nameGenerator, sociogram] = protocol.stages;
      const document = asSchema8Protocol({
        ...protocol,
        stages: [
          {
            ...nameGenerator,
            skipLogic: { action: 'SKIP', filter: { rules: [] } },
            panels: [networkPanel({ rules: [] })],
          },
          { ...sociogram, filter: { rules: [] } },
        ],
      });

      expect(
        migrationV8toV9.migrate(ProtocolSchemaV8.parse(document), {}),
      ).toMatchObject({
        stages: [
          {
            skipLogic: { filter: { rules: [] } },
            panels: [{ filter: { rules: [] } }],
          },
          { filter: { rules: [] } },
          { type: 'FinishSession' },
        ],
      });
      expect(() => migrateProtocol(document, 9)).toThrow(
        MigrationResultInvalidError,
      );
    },
  );

  it('says so in the migration notes', () => {
    const note = getMigrationInfo(8).notes.find(({ version }) => version === 9);

    expect(note?.notes).toContain(
      'Skip logic and filters can no longer compare the answers to an encrypted attribute.',
    );
  });
});

type OptionValue = string | number;

// The base protocol with `person.category` offering an option per value, under
// the given validation.
const protocolWithCategoryValues = (
  values: OptionValue[],
  validation?: { minSelected?: number; maxSelected?: number },
) => {
  const base = createBaseProtocol();
  const { person } = base.codebook.node;
  return {
    ...base,
    codebook: {
      ...base.codebook,
      node: {
        ...base.codebook.node,
        person: {
          ...person,
          variables: {
            ...person.variables,
            category: {
              ...person.variables.category,
              options: values.map((value, index) => ({
                label: localized(`Option ${index + 1}`),
                value,
              })),
              ...(validation !== undefined && { validation }),
            },
          },
        },
      },
    },
  };
};

const migratedCategory = (protocol: unknown) => {
  const migrated = migrateProtocol(asSchema8Protocol(protocol), 9);
  return migrated.codebook.node?.person?.variables?.category;
};

describe('Migrating options that share a value from schema 8 to 9', () => {
  it('keeps the first option with each value and removes the later ones', () => {
    expect(
      migratedCategory(
        protocolWithCategoryValues(['friend', 'family', 'friend', 'family']),
      ),
    ).toMatchObject({
      options: [
        { label: localized('Option 1'), value: 'friend' },
        { label: localized('Option 2'), value: 'family' },
      ],
    });
  });

  it.each([
    [[1, 'work', '1'], 1],
    [['1', 'work', 1], '1'],
  ] as const)(
    'counts a number and text that read the same as one value, keeping the first of %j',
    (values, kept) => {
      expect(
        migratedCategory(protocolWithCategoryValues([...values])),
      ).toMatchObject({
        options: [
          { label: localized('Option 1'), value: kept },
          { label: localized('Option 2'), value: 'work' },
        ],
      });
    },
  );

  it('compares text exactly, without folding case', () => {
    expect(
      migratedCategory(protocolWithCategoryValues(['yes', 'Yes', 'YES'])),
    ).toMatchObject({
      options: [{ value: 'yes' }, { value: 'Yes' }, { value: 'YES' }],
    });
  });

  it('removes them from ordinal, edge and ego attributes too', () => {
    const base = createBaseProtocol();
    const ordinal = (values: OptionValue[]) => ({
      name: 'Closeness',
      label: 'Closeness',
      type: 'ordinal' as const,
      options: values.map((value) => ({ label: localized(`${value}`), value })),
    });
    const migrated = migrateProtocol(
      asSchema8Protocol({
        ...base,
        codebook: {
          ...base.codebook,
          ego: {
            variables: {
              ...base.codebook.ego.variables,
              mood: ordinal([0, 1, 0]),
            },
          },
          edge: {
            ...base.codebook.edge,
            knows: {
              ...base.codebook.edge.knows,
              variables: {
                ...base.codebook.edge.knows.variables,
                closeness: ordinal([3, 2, 3, 1]),
              },
            },
          },
        },
      }),
      9,
    );

    expect(migrated.codebook.ego?.variables?.mood).toMatchObject({
      options: [{ value: 0 }, { value: 1 }],
    });
    expect(migrated.codebook.edge?.knows?.variables?.closeness).toMatchObject({
      options: [{ value: 3 }, { value: 2 }, { value: 1 }],
    });
  });

  // The 7 to 8 migration counted 1 and "1" as two options, so it kept a
  // minimum the options left can no longer meet.
  it('removes a minimum selection the remaining options cannot meet', () => {
    const category = migratedCategory(
      protocolWithCategoryValues([1, 'work', '1'], {
        minSelected: 3,
        maxSelected: 3,
      }),
    );

    expect(category).toMatchObject({
      options: [{ value: 1 }, { value: 'work' }],
    });
    expect(category).toHaveProperty('validation', { maxSelected: 3 });
  });

  it('keeps a minimum selection the remaining options can meet', () => {
    expect(
      migratedCategory(
        protocolWithCategoryValues(['a', 'b', 'a'], { minSelected: 2 }),
      ),
    ).toHaveProperty('validation', { minSelected: 2 });
  });

  it('keeps rules that name the shared value, which still names an option', () => {
    const protocol = protocolWithCategoryValues(['friend', 'family', 'friend']);
    const rule = {
      type: 'node' as const,
      id: 'rule-friend',
      options: {
        type: 'person',
        attribute: 'category',
        operator: 'INCLUDES',
        value: ['friend'],
      },
    };
    const [nameGenerator, ...rest] = protocol.stages;
    const migrated = migrateProtocol(
      asSchema8Protocol({
        ...protocol,
        stages: [
          {
            ...nameGenerator,
            skipLogic: { action: 'SKIP', filter: { rules: [rule] } },
          },
          ...rest,
        ],
      }),
      9,
    );

    expect(migrated.stages[0]).toMatchObject({
      skipLogic: { filter: { rules: [rule] } },
    });
    expect(ProtocolSchemaV9.safeParse(migrated).success).toBe(true);
  });

  // The attribute only ever offered one answer, and no repair can invent a
  // second, so validation refuses it as it refuses a single option.
  it('leaves an attribute whose only two options share a value for validation to refuse', () => {
    expect(() =>
      migrateProtocol(
        asSchema8Protocol(protocolWithCategoryValues(['friend', 'friend'])),
        9,
      ),
    ).toThrow(MigrationResultInvalidError);
  });

  it('says so in the migration notes', () => {
    const note = getMigrationInfo(8).notes.find(({ version }) => version === 9);

    expect(note?.notes).toContain(
      'Each option of an ordinal or categorical attribute must now have a value of its own',
    );
  });
});

// Blank as schema 9 reads it: whitespace of any kind, and the invisible
// characters that take no space of their own.
const BLANK_TEXT = [
  ['a space', ' '],
  ['spaces', '   '],
  ['a tab', '\t'],
  ['a line break', '\n'],
  ['a non-breaking space', '\u00a0'],
  ['a zero-width space', '\u200b'],
] as const;

// The base protocol with an Ego Form opening on an introduction panel, as
// schema 8 stored it, with the panel's title and text as given (`undefined`
// leaves the key out).
const schema8WithIntroductionPanel = (
  panel: { title?: string; text?: string },
  label = 'About you',
) => {
  const base = createBaseProtocol();
  const document = asSchema8Protocol({
    ...base,
    stages: [
      ...base.stages,
      {
        id: 'ego-form',
        type: 'EgoForm' as const,
        label: localized(label),
        introductionPanel: {
          title: localized('Placeholder'),
          text: localized('Placeholder'),
        },
        form: {
          fields: [{ variable: 'egoName', prompt: localized('Your name?') }],
        },
      },
    ],
  });
  const stage = document.stages.find(({ id }) => id === 'ego-form');
  if (!stage || !('introductionPanel' in stage)) throw new Error('No panel');
  const introductionPanel: Record<string, unknown> = {};
  if (panel.title !== undefined) introductionPanel.title = panel.title;
  if (panel.text !== undefined) introductionPanel.text = panel.text;
  Reflect.set(stage, 'introductionPanel', introductionPanel);
  // A label can be blank too, as schema 8 held it.
  Reflect.set(stage, 'label', label);
  return document;
};

const migratedPanel = (document: unknown) =>
  migrateProtocol(document, 9).stages.find(({ id }) => id === 'ego-form');

// The stages the migration step itself gives, before validation.
const stagesMigratedFrom = (document: unknown): unknown[] => {
  const { stages } = migrationV8toV9.migrate(
    ProtocolSchemaV8.parse(document),
    {},
  );
  return Array.isArray(stages) ? stages : [];
};

describe('Migrating introduction panels from schema 8 to 9', () => {
  // Published protocols (SIXHUMENE Waves 1-3) give a panel a body of a single
  // space on purpose, to show only its title.
  it.each(BLANK_TEXT)(
    'removes text of %s, so the panel shows only its title',
    (_, text) => {
      expect(
        migratedPanel(schema8WithIntroductionPanel({ title: 'Welcome', text })),
      ).toMatchObject({
        introductionPanel: { title: localized('Welcome') },
      });
      expect(
        migratedPanel(schema8WithIntroductionPanel({ title: 'Welcome', text })),
      ).not.toHaveProperty('introductionPanel.text');
    },
  );

  it('keeps text that says something, padded or not', () => {
    expect(
      migratedPanel(
        schema8WithIntroductionPanel({ title: 'Welcome', text: ' Hello ' }),
      ),
    ).toMatchObject({
      introductionPanel: {
        title: localized('Welcome'),
        text: localized(' Hello '),
      },
    });
  });

  // The 7 to 8 migration gives a panel with no title the stage's label.
  it.each(BLANK_TEXT)(
    'gives a title of %s the stage label, as a missing title gets',
    (_, title) => {
      expect(
        migratedPanel(schema8WithIntroductionPanel({ title, text: 'Hello' })),
      ).toMatchObject({
        introductionPanel: {
          title: localized('About you'),
          text: localized('Hello'),
        },
      });
    },
  );

  // Schema 9 refuses the blank label itself; the panel is still titled.
  it('gives a blank title "Introduction" when the stage label is blank as well', () => {
    const stages = stagesMigratedFrom(
      schema8WithIntroductionPanel({ title: ' ', text: ' ' }, '\u00a0'),
    );
    expect(stages.at(-2)).toHaveProperty('introductionPanel', {
      title: localized('Introduction'),
    });
  });

  // Fresco re-runs this migration over rows already in schema 9 form.
  it('removes only the blank translations of text already localized', () => {
    const base = createBaseProtocol();
    const stage = {
      id: 'ego-form',
      type: 'EgoForm',
      label: { en: 'About you', fr: 'Vous' },
      introductionPanel: {
        title: { en: ' ', fr: 'Bienvenue' },
        text: { en: 'Hello', fr: '\t' },
      },
      form: {
        fields: [{ variable: 'egoName', prompt: { en: 'Name?', fr: 'Nom ?' } }],
      },
    };
    const [migrated] = stagesMigratedFrom({
      ...base,
      schemaVersion: 8,
      localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
      stages: [stage],
    });

    expect(migrated).toMatchObject({
      introductionPanel: { title: { fr: 'Bienvenue' }, text: { en: 'Hello' } },
    });
    expect(migrated).not.toHaveProperty('introductionPanel.title.en');
    expect(migrated).not.toHaveProperty('introductionPanel.text.fr');
  });

  it('removes text already localized that is blank in every language, and titles it from the label', () => {
    const base = createBaseProtocol();
    const [migrated] = stagesMigratedFrom({
      ...base,
      schemaVersion: 8,
      localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
      stages: [
        {
          id: 'ego-form',
          type: 'EgoForm',
          label: { en: 'About you', fr: ' ' },
          introductionPanel: {
            title: { en: '\u200b', fr: ' ' },
            text: { en: ' ', fr: '\t' },
          },
          form: {
            fields: [{ variable: 'egoName', prompt: { en: 'Name?' } }],
          },
        },
      ],
    });

    expect(migrated).toHaveProperty('introductionPanel', {
      title: { en: 'About you' },
    });
  });

  // Two published protocols in the validation corpus failed here: their
  // panels' titles were a space, which schema 8 accepted.
  it('migrates and validates a schema 5 protocol whose panels have blank titles and text', async () => {
    const v5Protocol = {
      schemaVersion: 5,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            variables: {
              name: { name: 'name', type: 'text', component: 'Text' },
            },
          },
        },
        edge: {},
        ego: {
          variables: {
            age: { name: 'age', type: 'number', component: 'Number' },
          },
        },
      },
      stages: [
        {
          id: 'ego-1',
          type: 'EgoForm',
          label: 'About you',
          introductionPanel: { title: ' ', text: ' ' },
          form: { fields: [{ variable: 'age', prompt: 'How old are you?' }] },
        },
        {
          id: 'ego-2',
          type: 'EgoForm',
          label: ' ',
          introductionPanel: { title: '\t', text: 'Some more questions.' },
          form: { fields: [{ variable: 'age', prompt: 'Still that old?' }] },
        },
        {
          id: 'alter-1',
          type: 'AlterForm',
          label: 'About them',
          subject: { entity: 'node', type: 'person' },
          introductionPanel: { title: ' ', text: '\n' },
          form: { fields: [{ variable: 'name', prompt: 'Their name?' }] },
        },
      ],
    };

    const migrated = migrateProtocol(v5Protocol, 9, { name: 'Blank panels' });
    const result = await validateProtocol(migrated);

    expect(result.success).toBe(true);
    expect(migrated.stages.slice(0, 3)).toMatchObject([
      { introductionPanel: { title: localized('About you') } },
      {
        introductionPanel: {
          title: localized('Stage 2'),
          text: localized('Some more questions.'),
        },
      },
      { introductionPanel: { title: localized('About them') } },
    ]);
    expect(migrated).not.toHaveProperty('introductionPanel.text');
    expect(migrated.stages[2]).not.toHaveProperty('introductionPanel.text');
  });

  it('says so in the migration notes', () => {
    const note = getMigrationInfo(8).notes.find(({ version }) => version === 9);

    expect(note?.notes).toContain(
      "An introduction panel's text is now optional",
    );
  });
});

// The base protocol with a Categorical Bin whose prompt has an "other" bin,
// as schema 8 stored it, with the bin's caption and question as given.
const schema8WithOtherBin = (other: {
  otherOptionLabel: string;
  otherVariablePrompt: string;
}) => {
  const base = createBaseProtocol();
  const document = asSchema8Protocol({
    ...base,
    stages: [
      ...base.stages,
      {
        id: 'bin',
        type: 'CategoricalBin' as const,
        label: localized('Sort them'),
        subject: { entity: 'node' as const, type: 'person' },
        prompts: [
          {
            id: 'bin-prompt',
            text: localized('How do you know them?'),
            variable: 'category',
            otherVariable: 'name',
            otherOptionLabel: localized('Placeholder'),
            otherVariablePrompt: localized('Placeholder'),
          },
        ],
      },
    ],
  });
  const stage = document.stages.find(({ id }) => id === 'bin');
  if (!stage || !('prompts' in stage)) throw new Error('No bin');
  const [prompt] = stage.prompts as Record<string, unknown>[];
  if (!prompt) throw new Error('No bin prompt');
  Object.assign(prompt, other);
  return document;
};

const migratedOtherBin = (other: {
  otherOptionLabel: string;
  otherVariablePrompt: string;
}) => {
  const stage = migrateProtocol(schema8WithOtherBin(other), 9).stages.find(
    ({ id }) => id === 'bin',
  );
  return stage && 'prompts' in stage ? stage.prompts[0] : undefined;
};

describe('Migrating the text of a Categorical Bin "other" bin from schema 8 to 9', () => {
  it.each(BLANK_TEXT)(
    'gives a caption of %s the question, and a question of it the caption',
    (_, blank) => {
      expect(
        migratedOtherBin({
          otherOptionLabel: blank,
          otherVariablePrompt: 'What else?',
        }),
      ).toMatchObject({
        otherOptionLabel: localized('What else?'),
        otherVariablePrompt: localized('What else?'),
      });
      expect(
        migratedOtherBin({
          otherOptionLabel: 'Something else',
          otherVariablePrompt: blank,
        }),
      ).toMatchObject({
        otherOptionLabel: localized('Something else'),
        otherVariablePrompt: localized('Something else'),
      });
    },
  );

  it('uses the 7 to 8 defaults when both are blank', () => {
    expect(
      migratedOtherBin({ otherOptionLabel: ' ', otherVariablePrompt: '\t' }),
    ).toMatchObject({
      otherOptionLabel: localized('Other'),
      otherVariablePrompt: localized('Please specify'),
    });
  });

  it('keeps text that says something', () => {
    expect(
      migratedOtherBin({
        otherOptionLabel: 'Something else',
        otherVariablePrompt: 'What else?',
      }),
    ).toMatchObject({
      otherOptionLabel: localized('Something else'),
      otherVariablePrompt: localized('What else?'),
    });
  });

  // Fresco re-runs this migration over rows already in schema 9 form.
  it('removes only the blank translations of text already localized', () => {
    const base = createBaseProtocol();
    const [stage] = stagesMigratedFrom({
      ...base,
      schemaVersion: 8,
      localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
      stages: [
        {
          id: 'bin',
          type: 'CategoricalBin',
          label: { en: 'Sort them' },
          subject: { entity: 'node', type: 'person' },
          prompts: [
            {
              id: 'bin-prompt',
              text: { en: 'How do you know them?' },
              variable: 'category',
              otherVariable: 'name',
              otherOptionLabel: { en: 'Other', fr: '   ' },
              otherVariablePrompt: { en: ' ', fr: '\t' },
            },
          ],
        },
      ],
    });

    expect(stage).toMatchObject({
      prompts: [
        {
          otherOptionLabel: { en: 'Other' },
          otherVariablePrompt: { en: 'Other' },
        },
      ],
    });
    expect(stage).not.toHaveProperty('prompts.0.otherOptionLabel.fr');
  });

  it('says so in the migration notes', () => {
    const note = getMigrationInfo(8).notes.find(({ version }) => version === 9);

    expect(note?.notes).toContain(
      'On a Categorical Bin stage, the label of the bin for answers not listed',
    );
  });
});
