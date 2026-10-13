import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { MigrationResultInvalidError } from '../../../migration/errors.ts';
import {
  getMigrationInfo,
  migrateProtocol,
  migrateProtocolWithSessions,
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

  it('rewrites a rule that names a value merged into one of another type', () => {
    const protocol = protocolWithCategoryValues([1, 'work', '1']);
    const rule = (value: unknown) => ({
      type: 'node' as const,
      id: 'rule-one',
      options: {
        type: 'person',
        attribute: 'category',
        operator: 'INCLUDES',
        value,
      },
    });
    const [nameGenerator, ...rest] = protocol.stages;
    const migrated = migrateProtocol(
      asSchema8Protocol({
        ...protocol,
        stages: [
          {
            ...nameGenerator,
            skipLogic: { action: 'SKIP', filter: { rules: [rule(['1'])] } },
          },
          ...rest,
        ],
      }),
      9,
    );

    expect(migrated.stages[0]).toMatchObject({
      skipLogic: { filter: { rules: [rule([1])] } },
    });
  });

  it('rewrites a shape mapping keyed by a value merged into one of another type', () => {
    const protocol = protocolWithCategoryValues([1, 'work', '1']);
    const { person } = protocol.codebook.node;
    const migrated = migrateProtocol(
      asSchema8Protocol({
        ...protocol,
        codebook: {
          ...protocol.codebook,
          node: {
            ...protocol.codebook.node,
            person: {
              ...person,
              shape: {
                default: 'circle',
                dynamic: {
                  variable: 'category',
                  type: 'discrete',
                  map: [
                    { value: '1', shape: 'square' },
                    { value: 'work', shape: 'diamond' },
                  ],
                },
              },
            },
          },
        },
      }),
      9,
    );

    expect(migrated.codebook.node?.person?.shape.dynamic).toMatchObject({
      map: [
        { value: 1, shape: 'square' },
        { value: 'work', shape: 'diamond' },
      ],
    });
  });

  it('keeps the first shape when two mapped values merge', () => {
    const protocol = protocolWithCategoryValues([1, 'work', '1']);
    const { person } = protocol.codebook.node;
    const migrated = migrateProtocol(
      asSchema8Protocol({
        ...protocol,
        codebook: {
          ...protocol.codebook,
          node: {
            ...protocol.codebook.node,
            person: {
              ...person,
              shape: {
                default: 'circle',
                dynamic: {
                  variable: 'category',
                  type: 'discrete',
                  map: [
                    { value: 1, shape: 'square' },
                    { value: '1', shape: 'diamond' },
                  ],
                },
              },
            },
          },
        },
      }),
      9,
    );

    expect(migrated.codebook.node?.person?.shape.dynamic).toMatchObject({
      map: [{ value: 1, shape: 'square' }],
    });
  });

  it('rewrites recorded answers that hold a value merged into one of another type', () => {
    const { migrateSession } = migrateProtocolWithSessions(
      asSchema8Protocol(protocolWithCategoryValues([1, 'work', '1'])),
    );
    const person = (_uid: string, category: unknown) => ({
      _uid,
      type: 'person',
      attributes: { category },
    });
    const result = migrateSession({
      network: {
        ego: { _uid: 'ego', attributes: {} },
        nodes: [
          person('a', ['1']),
          person('b', ['1', 1, 'work']),
          person('c', [1]),
          { _uid: 'd', type: 'place', attributes: { category: ['1'] } },
        ],
        edges: [],
      },
      stageMetadata: {},
      currentStep: 0,
    });
    if (!result.success) throw result.error;

    expect(
      result.session.network.nodes.map(({ attributes }) => attributes),
    ).toEqual([
      { category: [1] },
      { category: [1, 'work'] },
      { category: [1] },
      { category: ['1'] },
    ]);
  });

  it('leaves an encrypted answer as stored when its option values merge', () => {
    const { migrateSession } = migrateProtocolWithSessions(
      asSchema8Protocol(protocolWithCategoryValues(['1', 'work', 1])),
    );
    const ciphertext = [1, 7, 1, 42];
    const result = migrateSession({
      network: {
        ego: { _uid: 'ego', attributes: {} },
        nodes: [
          {
            _uid: 'a',
            type: 'person',
            attributes: { category: ciphertext },
            _secureAttributes: { category: { iv: [1, 2], salt: [3, 4] } },
          },
          { _uid: 'b', type: 'person', attributes: { category: [1] } },
        ],
        edges: [],
      },
      stageMetadata: {},
      currentStep: 0,
    });
    if (!result.success) throw result.error;

    expect(
      result.session.network.nodes.map(({ attributes }) => attributes),
    ).toEqual([{ category: ciphertext }, { category: ['1'] }]);
  });

  it.each([
    ['spaces around it', ' friend ', 'friend'],
    ['a tab inside it', 'close\tfriend', 'close friend'],
    ['a line break inside it', 'close\nfriend', 'close friend'],
    ['a decomposed spelling', 'cafe\u0301', 'caf\u00e9'],
    ['a control character', 'fri\u0007end', 'fri end'],
  ])(
    'makes a value with %s a valid name, so the protocol still opens',
    (_description, value, name) => {
      const migrated = migrateProtocol(
        asSchema8Protocol(protocolWithCategoryValues([value, 'family'])),
        9,
      );

      expect(migrated.codebook.node?.person?.variables?.category).toMatchObject(
        { options: [{ value: name }, { value: 'family' }] },
      );
    },
  );

  it('names an option whose value is empty after its label, or its position when the label is taken', () => {
    const protocol = protocolWithCategoryValues(['', 'Option 1', '  ']);

    expect(migratedCategory(protocol)).toMatchObject({
      options: [
        { value: 'Option 1 2' },
        { value: 'Option 1' },
        { value: 'Option 3' },
      ],
    });
  });

  it('merges a value that, once repaired, repeats an earlier one', () => {
    expect(
      migratedCategory(
        protocolWithCategoryValues(['friend', 'family', 'friend ']),
      ),
    ).toMatchObject({ options: [{ value: 'friend' }, { value: 'family' }] });
  });

  it('rewrites rules and recorded answers that hold a repaired value', () => {
    const protocol = protocolWithCategoryValues([' friend', 'family']);
    const rule = (value: unknown) => ({
      type: 'node' as const,
      id: 'rule-friend',
      options: {
        type: 'person',
        attribute: 'category',
        operator: 'INCLUDES',
        value,
      },
    });
    const [nameGenerator, ...rest] = protocol.stages;
    const schema8 = asSchema8Protocol({
      ...protocol,
      stages: [
        {
          ...nameGenerator,
          skipLogic: { action: 'SKIP', filter: { rules: [rule([' friend'])] } },
        },
        ...rest,
      ],
    });
    const { protocol: migrated, migrateSession } =
      migrateProtocolWithSessions(schema8);

    expect(migrated.stages[0]).toMatchObject({
      skipLogic: { filter: { rules: [rule(['friend'])] } },
    });
    const result = migrateSession({
      network: {
        ego: { _uid: 'ego', attributes: {} },
        nodes: [
          {
            _uid: 'a',
            type: 'person',
            attributes: { category: [' friend', 'family'] },
          },
        ],
        edges: [],
      },
      stageMetadata: {},
      currentStep: 0,
    });
    if (!result.success) throw result.error;
    expect(result.session.network.nodes[0]?.attributes).toEqual({
      category: ['friend', 'family'],
    });
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

// The base protocol with a Tie-Strength Census whose prompt has the decline
// label given, as schema 8 stored it.
const migratedDeclineLabel = (negativeLabel: string) => {
  const base = createBaseProtocol();
  const document = asSchema8Protocol({
    ...base,
    stages: [
      ...base.stages,
      {
        id: 'tie-strength',
        type: 'TieStrengthCensus' as const,
        label: localized('Rate them'),
        subject: { entity: 'node' as const, type: 'person' },
        introductionPanel: {
          title: localized('Rate them'),
          text: localized('Rate each pair.'),
        },
        prompts: [
          {
            id: 'tie-strength-prompt',
            text: localized('How close are these people?'),
            createEdge: 'knows',
            edgeVariable: 'closeness',
            negativeLabel: localized('Placeholder'),
          },
        ],
      },
    ],
  });
  const stage = document.stages.find(({ id }) => id === 'tie-strength');
  if (!stage || !('prompts' in stage)) throw new Error('No census');
  const [prompt] = stage.prompts as Record<string, unknown>[];
  if (!prompt) throw new Error('No census prompt');
  prompt.negativeLabel = negativeLabel;
  const migrated = migrateProtocol(document, 9).stages.find(
    ({ id }) => id === 'tie-strength',
  );
  return migrated && 'prompts' in migrated ? migrated.prompts[0] : undefined;
};

describe('Migrating a Tie-Strength Census decline label from schema 8 to 9', () => {
  it.each(BLANK_TEXT)(
    'gives a label of %s the 7 to 8 default, "No relationship"',
    (_, blank) => {
      expect(migratedDeclineLabel(blank)).toMatchObject({
        negativeLabel: localized('No relationship'),
      });
    },
  );

  it('keeps a label that says something', () => {
    expect(migratedDeclineLabel('Not close')).toMatchObject({
      negativeLabel: localized('Not close'),
    });
  });

  it('says so in the migration notes', () => {
    const note = getMigrationInfo(8).notes.find(({ version }) => version === 9);

    expect(note?.notes).toContain(
      'On a Tie-Strength Census stage, the label of the option for declining',
    );
  });
});

// The base protocol with an Information stage whose title is given, as
// schema 8 stored it.
const migratedInformationTitle = (title: string) => {
  const base = createBaseProtocol();
  const document = asSchema8Protocol({
    ...base,
    stages: [
      {
        id: 'welcome',
        type: 'Information' as const,
        label: localized('Welcome'),
        title: localized('Placeholder'),
        items: [
          { id: 'item', type: 'text' as const, content: localized('Hi') },
        ],
      },
      ...base.stages,
    ],
  });
  const stage = document.stages.find(({ id }) => id === 'welcome');
  if (!stage) throw new Error('No Information stage');
  (stage as Record<string, unknown>).title = title;
  const migrated = migrateProtocol(document, 9);
  return migrated.stages.find(({ id }) => id === 'welcome');
};

describe('Migrating an Information stage title from schema 8 to 9', () => {
  it.each(BLANK_TEXT)('gives a title of %s the stage name', (_, blank) => {
    expect(migratedInformationTitle(blank)).toMatchObject({
      title: localized('Welcome'),
    });
  });

  it('keeps a title that says something', () => {
    expect(migratedInformationTitle('Hello')).toMatchObject({
      title: localized('Hello'),
    });
  });

  it('says so in the migration notes', () => {
    const note = getMigrationInfo(8).notes.find(({ version }) => version === 9);

    expect(note?.notes).toContain(
      'The title of an Information stage must now contain some text',
    );
  });
});

// The base protocol with a Narrative stage of two presets, the first labelled
// as given, as schema 8 stored it.
const migratedNarrative = (label: string) => {
  const base = createBaseProtocol();
  const document = asSchema8Protocol({
    ...base,
    stages: [
      ...base.stages,
      {
        id: 'narrative',
        type: 'Narrative' as const,
        label: localized('Tell the story'),
        subject: { entity: 'node' as const, type: 'person' },
        presets: [
          {
            id: 'first',
            label: localized('Placeholder'),
            layoutVariable: 'layoutPosition',
          },
          {
            id: 'second',
            label: localized('Placeholder'),
            layoutVariable: 'layoutPosition',
          },
        ],
        background: { concentricCircles: 3 },
        behaviours: {},
      },
    ],
  });
  const stage = document.stages.find(({ id }) => id === 'narrative');
  if (!stage || !('presets' in stage)) throw new Error('No Narrative stage');
  const presets = stage.presets as Record<string, unknown>[];
  for (const preset of presets) preset.label = label;
  return migrateProtocol(document, 9).stages.find(
    ({ id }) => id === 'narrative',
  );
};

describe('Migrating Narrative preset labels from schema 8 to 9', () => {
  it.each(BLANK_TEXT)(
    'gives a label of %s the 7 to 8 default, "Preset" and its position',
    (_, blank) => {
      expect(migratedNarrative(blank)).toMatchObject({
        presets: [
          { label: localized('Preset 1') },
          { label: localized('Preset 2') },
        ],
      });
    },
  );

  it('keeps a label that says something', () => {
    expect(migratedNarrative('Closeness')).toMatchObject({
      presets: [
        { label: localized('Closeness') },
        { label: localized('Closeness') },
      ],
    });
  });

  // Fresco re-runs this migration over rows already in schema 9 form.
  it('removes only the blank translations of text already localized, and names a highlight left blank', () => {
    const base = createBaseProtocol();
    const [stage] = stagesMigratedFrom({
      ...base,
      schemaVersion: 8,
      localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
      stages: [
        {
          id: 'narrative',
          type: 'Narrative',
          label: { en: 'Tell the story' },
          subject: { entity: 'node', type: 'person' },
          presets: [
            {
              id: 'first',
              label: { en: 'Closeness', fr: '  ' },
              layoutVariable: 'layoutPosition',
              highlight: [{ variable: 'age', label: { en: ' ', fr: '\t' } }],
            },
          ],
          background: { concentricCircles: 3 },
          behaviours: {},
        },
      ],
    });

    expect(stage).toMatchObject({
      presets: [
        {
          label: { en: 'Closeness' },
          highlight: [{ variable: 'age', label: { en: 'Age' } }],
        },
      ],
    });
    expect(stage).not.toHaveProperty('presets.0.label.fr');
  });
});

// The base protocol with its Name Generator form titled as given, as schema 8
// stored it.
const migratedFormTitle = (title: string, nodeTypeName = 'Person') => {
  const base = createBaseProtocol();
  const document = asSchema8Protocol({
    ...base,
    codebook: {
      ...base.codebook,
      node: {
        ...base.codebook.node,
        person: { ...base.codebook.node.person, name: nodeTypeName },
      },
    },
  });
  const stage = document.stages.find(({ id }) => id === 'nameGenerator1');
  if (!stage || !('form' in stage)) throw new Error('No Name Generator');
  (stage.form as Record<string, unknown>).title = title;
  const migrated = migrateProtocol(document, 9).stages.find(
    ({ id }) => id === 'nameGenerator1',
  );
  return migrated && 'form' in migrated ? migrated.form : undefined;
};

describe('Migrating a Name Generator form title from schema 8 to 9', () => {
  it.each(BLANK_TEXT)(
    'gives a title of %s the 7 to 8 default, "Add" and the node type',
    (_, blank) => {
      expect(migratedFormTitle(blank)).toMatchObject({
        title: localized('Add Person'),
      });
    },
  );

  // Schema 9 refuses the blank name itself, so the step runs unvalidated.
  it('gives it "Add" alone when the node type name shows nothing', () => {
    const base = createBaseProtocol();
    const document = asSchema8Protocol(base) as Record<string, unknown>;
    const codebook = document.codebook as {
      node: { person: Record<string, unknown> };
    };
    codebook.node.person.name = ' ';
    const [stage] = document.stages as Record<string, unknown>[];
    if (!stage) throw new Error('No Name Generator');
    (stage.form as Record<string, unknown>).title = ' ';
    expect(stagesMigratedFrom(document)[0]).toMatchObject({
      form: { title: localized('Add') },
    });
  });

  it('keeps a title that says something', () => {
    expect(migratedFormTitle('Name someone')).toMatchObject({
      title: localized('Name someone'),
    });
  });
});

// The base protocol with an Information stage whose first text item holds
// the text given, as schema 8 stored it.
const migratedInformationItems = (content: string) => {
  const base = createBaseProtocol();
  const document = asSchema8Protocol({
    ...base,
    stages: [
      {
        id: 'welcome',
        type: 'Information' as const,
        label: localized('Welcome'),
        title: localized('Welcome'),
        items: [
          { id: 'first', type: 'text' as const, content: localized('Hi') },
          { id: 'second', type: 'text' as const, content: localized('Bye') },
        ],
      },
      ...base.stages,
    ],
  });
  const stage = document.stages.find(({ id }) => id === 'welcome');
  if (!stage || !('items' in stage)) throw new Error('No Information stage');
  const [first] = stage.items as Record<string, unknown>[];
  if (!first) throw new Error('No text item');
  first.content = content;
  const migrated = migrateProtocol(document, 9).stages.find(
    ({ id }) => id === 'welcome',
  );
  return migrated && 'items' in migrated ? migrated.items : undefined;
};

describe('Migrating Information text items from schema 8 to 9', () => {
  it.each(BLANK_TEXT)('removes an item of %s', (_, blank) => {
    expect(migratedInformationItems(blank)).toEqual([
      { id: 'second', type: 'text', content: localized('Bye') },
    ]);
  });

  it('keeps an item that says something', () => {
    expect(migratedInformationItems('Hello')).toEqual([
      { id: 'first', type: 'text', content: localized('Hello') },
      { id: 'second', type: 'text', content: localized('Bye') },
    ]);
  });
});

// The base protocol with its Name Generator form field hinted as given.
const migratedHint = (hint: unknown, locales = ['en']) => {
  const base = createBaseProtocol();
  const document = asSchema8Protocol(base) as Record<string, unknown>;
  const stage = (document.stages as Record<string, unknown>[])[0];
  const form = stage?.form as Record<string, unknown> | undefined;
  const [field] = (form?.fields ?? []) as Record<string, unknown>[];
  if (!field) throw new Error('No form field');
  field.hint = hint;
  if (locales.length > 1) {
    document.localization = { defaultLocale: 'en', locales };
  }
  const migrated = migrateProtocol(document, 9).stages.find(
    ({ id }) => id === 'nameGenerator1',
  );
  return migrated && 'form' in migrated ? migrated.form?.fields[0] : undefined;
};

describe('Migrating optional text that shows nothing from schema 8 to 9', () => {
  it.each(BLANK_TEXT)('removes a hint of %s', (_, blank) => {
    expect(migratedHint(blank)).not.toHaveProperty('hint');
  });

  it('removes an empty hint', () => {
    expect(migratedHint('')).not.toHaveProperty('hint');
  });

  it('keeps a hint that says something', () => {
    expect(migratedHint('Their full name')).toMatchObject({
      hint: localized('Their full name'),
    });
  });

  // Fresco re-runs this migration over rows already in schema 9 form.
  it('removes only the blank translations of text already localized', () => {
    expect(
      migratedHint({ en: 'Their full name', fr: '  ' }, ['en', 'fr']),
    ).toMatchObject({ hint: { en: 'Their full name' } });
    expect(
      migratedHint({ en: 'Their full name', fr: '  ' }, ['en', 'fr']),
    ).not.toHaveProperty('hint.fr');
  });

  it('removes text already localized that is blank in every language', () => {
    expect(migratedHint({ en: '', fr: '​' }, ['en', 'fr'])).not.toHaveProperty(
      'hint',
    );
  });

  it('removes a scale end label that shows nothing', () => {
    const base = createBaseProtocol();
    const document = asSchema8Protocol({
      ...base,
      codebook: {
        ...base.codebook,
        ego: {
          variables: {
            ...base.codebook.ego.variables,
            egoCloseness: {
              name: 'EgoCloseness',
              label: 'EgoCloseness',
              type: 'scalar',
              component: 'VisualAnalogScale',
              parameters: {
                minLabel: localized('Not close'),
                maxLabel: localized('Placeholder'),
              },
            },
          },
        },
      },
    }) as Record<string, unknown>;
    const codebook = document.codebook as {
      ego: {
        variables: { egoCloseness: { parameters: Record<string, unknown> } };
      };
    };
    codebook.ego.variables.egoCloseness.parameters.maxLabel = '  ';
    const migrated = migrateProtocol(document, 9);

    expect(migrated.codebook.ego?.variables?.egoCloseness).toMatchObject({
      parameters: { minLabel: localized('Not close') },
    });
    expect(migrated.codebook.ego?.variables?.egoCloseness).not.toHaveProperty(
      'parameters.maxLabel',
    );
  });
});

describe('The schema 9 migration notes', () => {
  it('say that other text participants see must contain some text', () => {
    const note = getMigrationInfo(8).notes.find(({ version }) => version === 9);

    expect(note?.notes).toContain(
      'Some other text that participants see must now contain some text.',
    );
  });
});
