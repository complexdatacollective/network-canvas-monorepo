import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import {
  testId,
  withOriginalCodebookKeys,
  withTestCodebookIds,
} from '../../../__tests__/testIds.ts';
import {
  MigrationContentRefusedError,
  MigrationResultInvalidError,
} from '../../../migration/errors.ts';
import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import {
  collectProtocolObjectIds,
  findDuplicateProtocolObjectIds,
} from '../../../utils/collectProtocolObjectIds.ts';
import { createBaseProtocol, localized } from '../../../utils/test-utils.ts';
import validateProtocol from '../../../validation/validate-protocol.ts';
import ProtocolSchemaV8 from '../../8/schema.ts';
import migrationV8toV9 from '../migration.ts';
import { isProtocolObjectId } from '../protocol-object-id.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { migratedStageId } from './migrated-stage-ids.ts';
import { asSchema8Protocol } from './schema-8-protocol.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// A migration to schema 9, with each node type, edge type and variable
// under the key the document gave it (see `withOriginalCodebookKeys`).
const migrateReadable = (
  document: unknown,
  targetVersion?: 9,
  dependencies?: Record<string, unknown>,
) =>
  withOriginalCodebookKeys(
    migrateProtocol(document, targetVersion, dependencies),
    document,
  );

// The stage of `document`, migrated to schema 9, that was its schema 8 stage
// `id`.
const findMigratedStage = (
  document: unknown,
  id: string,
  migrated = migrateReadable(document, 9),
) => {
  const newId = migratedStageId(document, migrated, id);
  return migrated.stages.find((stage) => stage.id === newId);
};

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
  migrateReadable(asSchema8Protocol(createBaseProtocol()), 9);

describe('Migrating encrypted attributes from schema 8 to 9', () => {
  it('keeps them encrypted when the experiment was on, and drops the experiment', () => {
    const migrated = migrateReadable(
      schema8WithEncryptedName({ encryptedVariables: true }),
      9,
    );

    expect(migrated.codebook.node?.person?.variables?.name).toMatchObject({
      encrypted: true,
    });
    expect(migrated.experiments).toStrictEqual({});
    expect(
      ProtocolSchemaV9.safeParse(withTestCodebookIds(migrated)).success,
    ).toBe(true);
  });

  // The schema 8 alpha named the experiment `encryptNames`, and its runtime
  // encrypted marked attributes while it was on.
  it('keeps them encrypted when the alpha flag was on, and drops the flag', () => {
    const migrated = migrateReadable(
      schema8WithEncryptedName({ encryptNames: true }),
      9,
    );

    expect(migrated.codebook.node?.person?.variables?.name).toMatchObject({
      encrypted: true,
    });
    expect(migrated.experiments).toStrictEqual({});
    expect(
      ProtocolSchemaV9.safeParse(withTestCodebookIds(migrated)).success,
    ).toBe(true);
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
      const migrated = migrateReadable(
        schema8WithEncryptedName(experiments),
        9,
      );

      expect(migrated.codebook.node?.person?.variables?.name).toEqual(
        migratedBase().codebook.node?.person?.variables?.name,
      );
      expect(migrated.experiments).toStrictEqual({});
      expect(
        ProtocolSchemaV9.safeParse(withTestCodebookIds(migrated)).success,
      ).toBe(true);
    },
  );

  it('unmarks them when the protocol had no experiments, and adds none', () => {
    const migrated = migrateReadable(schema8WithEncryptedName(undefined), 9);

    expect(migrated.codebook.node?.person?.variables?.name).toEqual(
      migratedBase().codebook.node?.person?.variables?.name,
    );
    expect(Object.hasOwn(migrated, 'experiments')).toBe(false);
    expect(
      ProtocolSchemaV9.safeParse(withTestCodebookIds(migrated)).success,
    ).toBe(true);
  });

  it('changes nothing else in the codebook', () => {
    const migrated = migrateReadable(schema8WithEncryptedName(undefined), 9);

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
        id: testId('anonymisation'),
        type: 'Anonymisation' as const,
        label: localized('Anonymisation'),
        explanationText: localized('# Privacy\n\nChoose a passphrase.'),
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
    const migrated = migrateReadable(
      schema8WithPassphraseRules({ minLength: 9, maxLength: 6 }),
      9,
    );

    // No passphrase could meet both, so neither is kept and the interview's
    // default applies. Every stage stays, in its order.
    // Every migration gives new ids, so they differ between the two.
    expect(withoutIds(migrated.stages)).toEqual(
      withoutIds(
        migrateReadable(schema8WithPassphraseRules(undefined), 9).stages,
      ),
    );
  });

  it.each([
    { minLength: 4, maxLength: 12 },
    { minLength: 6, maxLength: 6 },
    { maxLength: 6 },
    { minLength: 10 },
  ])('keeps %j, which a passphrase can meet', (validation) => {
    const migrated = migrateReadable(schema8WithPassphraseRules(validation), 9);

    expect(
      migrated.stages.find(({ type }) => type === 'Anonymisation'),
    ).toMatchObject({ validation });
  });
});

const nodeRule = (id: string, attribute: string, value: string | number) => ({
  type: 'node' as const,
  id: testId(id),
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
  id: testId(`rule-${operator}`),
  options: { type: 'person', attribute: 'name', operator },
});

// The name generator's panel over the interview's own network.
const networkPanel = (filter: object) => ({
  id: testId('panel-network'),
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
            id: testId('panel-external'),
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
    const [nameGenerator, sociogram] = migrateReadable(
      asSchema8Protocol(
        protocolWithRulesOnEncryptedName({ encryptedVariables: true }),
      ),
      9,
    ).stages;

    expect(nameGenerator).not.toHaveProperty('skipLogic');
    expect(withoutIds(nameGenerator)).toMatchObject(
      objectWithoutIds({
        panels: [
          { filter: { join: 'AND', rules: [ageRule] } },
          // The external file's rows are not encrypted, so its rule still works.
          { filter: { rules: [nameRule] } },
        ],
      }),
    );
    expect(sociogram).not.toHaveProperty('filter');
  });

  it('keeps them when the experiment was off, because the attribute is no longer encrypted', () => {
    const [nameGenerator, sociogram] = migrateReadable(
      asSchema8Protocol(protocolWithRulesOnEncryptedName(undefined)),
      9,
    ).stages;

    // The rule is repeated in four places, and each copy gets an id of its own.
    expect(withoutIds(nameGenerator)).toMatchObject(
      objectWithoutIds({
        skipLogic: { action: 'SKIP', filter: { rules: [nameRule] } },
        panels: [
          { filter: { join: 'AND', rules: [nameRule, ageRule] } },
          { filter: { rules: [nameRule] } },
        ],
      }),
    );
    expect(withoutIds(sociogram)).toMatchObject(
      objectWithoutIds({ filter: { rules: [nameRule] } }),
    );
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

    const migrated = migrateReadable(
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

    expect(withoutIds(migratedNameGenerator)).toMatchObject(
      objectWithoutIds({
        skipLogic: { action: 'SKIP', filter: { rules: [answered] } },
        panels: [{ filter: { join: 'AND', rules: [unanswered] } }],
      }),
    );
    expect(withoutIds(migratedSociogram)).toMatchObject(
      objectWithoutIds({ filter: { join: 'OR', rules: [answered] } }),
    );
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
      expect(() => migrateReadable(document, 9)).toThrow(
        MigrationResultInvalidError,
      );
    },
  );
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
  const migrated = migrateReadable(asSchema8Protocol(protocol), 9);
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
      type: 'ordinal' as const,
      options: values.map((value) => ({ label: localized(`${value}`), value })),
    });
    const migrated = migrateReadable(
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
      id: testId('rule-friend'),
      options: {
        type: 'person',
        attribute: 'category',
        operator: 'INCLUDES',
        value: ['friend'],
      },
    };
    const [nameGenerator, ...rest] = protocol.stages;
    const migrated = migrateReadable(
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

    expect(withoutIds(migrated.stages[0])).toMatchObject(
      objectWithoutIds({ skipLogic: { filter: { rules: [rule] } } }),
    );
    expect(
      ProtocolSchemaV9.safeParse(withTestCodebookIds(migrated)).success,
    ).toBe(true);
  });

  it('rewrites a rule that names a value merged into one of another type', () => {
    const protocol = protocolWithCategoryValues([1, 'work', '1']);
    const rule = (value: unknown) => ({
      type: 'node' as const,
      id: testId('rule-one'),
      options: {
        type: 'person',
        attribute: 'category',
        operator: 'INCLUDES',
        value,
      },
    });
    const [nameGenerator, ...rest] = protocol.stages;
    const migrated = migrateReadable(
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

    expect(withoutIds(migrated.stages[0])).toMatchObject(
      objectWithoutIds({ skipLogic: { filter: { rules: [rule([1])] } } }),
    );
  });

  it('rewrites a shape mapping keyed by a value merged into one of another type', () => {
    const protocol = protocolWithCategoryValues([1, 'work', '1']);
    const { person } = protocol.codebook.node;
    const migrated = migrateReadable(
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
    const migrated = migrateReadable(
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

  it.each([
    ['spaces around it', ' friend ', 'friend'],
    ['a tab inside it', 'close\tfriend', 'close friend'],
    ['a line break inside it', 'close\nfriend', 'close friend'],
    ['a decomposed spelling', 'cafe\u0301', 'caf\u00e9'],
    ['a control character', 'fri\u0007end', 'fri end'],
  ])(
    'makes a value with %s a valid name, so the protocol still opens',
    (_description, value, name) => {
      const migrated = migrateReadable(
        asSchema8Protocol(protocolWithCategoryValues([value, 'family'])),
        9,
      );

      expect(migrated.codebook.node?.person?.variables?.category).toMatchObject(
        { options: [{ value: name }, { value: 'family' }] },
      );
    },
  );

  // What an option records cannot be known when its value is blank, so the
  // migration supplies none and the document is refused at that value.
  it.each([
    ['empty', ''],
    ['only spaces', '  '],
    ['only a tab and a line break', '\t\n'],
  ])('refuses a value that is %s at that value', (_description, value) => {
    const document = asSchema8Protocol(
      protocolWithCategoryValues(['friend', value]),
    );
    let refusal: unknown;
    try {
      migrateProtocol(document, 9);
    } catch (error) {
      refusal = error;
    }

    // The migration gives the type and the attribute new ids, so the place
    // names them by their names.
    expect(refusal).toBeInstanceOf(MigrationContentRefusedError);
    expect(
      refusal instanceof MigrationContentRefusedError ? refusal.problems : [],
    ).toContainEqual(
      expect.objectContaining({
        place: expect.stringMatching(
          /^Node type “Person”, attribute “Category”, the value of option 2 /,
        ),
        path: [
          'codebook',
          'node',
          expect.stringMatching(UUID),
          'variables',
          expect.stringMatching(UUID),
          'options',
          1,
          'value',
        ],
      }),
    );
  });

  it('merges a value that, once repaired, repeats an earlier one', () => {
    expect(
      migratedCategory(
        protocolWithCategoryValues(['friend', 'family', 'friend ']),
      ),
    ).toMatchObject({ options: [{ value: 'friend' }, { value: 'family' }] });
  });

  it('rewrites rules that hold a repaired value', () => {
    const protocol = protocolWithCategoryValues([' friend', 'family']);
    const rule = (value: unknown) => ({
      type: 'node' as const,
      id: testId('rule-friend'),
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
    const migrated = migrateReadable(schema8, 9);

    expect(withoutIds(migrated.stages[0])).toMatchObject(
      objectWithoutIds({
        skipLogic: { filter: { rules: [rule(['friend'])] } },
      }),
    );
  });

  // The attribute only ever offered one answer, and no repair can invent a
  // second, so validation refuses it as it refuses a single option.
  it('leaves an attribute whose only two options share a value for validation to refuse', () => {
    expect(() =>
      migrateReadable(
        asSchema8Protocol(protocolWithCategoryValues(['friend', 'friend'])),
        9,
      ),
    ).toThrow(MigrationResultInvalidError);
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

// The base protocol's Anonymisation stage with the given explanation, as
// schema 8 stored it, migrated to schema 9.
const migratedExplanation = (explanationText: Record<string, unknown>) => {
  const document = schema8WithPassphraseRules(undefined);
  const stage = document.stages.find(
    ({ id }) => id === testId('anonymisation'),
  );
  if (!stage) throw new Error('No Anonymisation stage');
  stage.explanationText = explanationText;
  return findMigratedStage(document, testId('anonymisation'));
};

describe('Migrating an Anonymisation title from schema 8 to 9', () => {
  it('writes the title as a heading above the text', () => {
    expect(
      migratedExplanation({ title: 'Privacy', body: 'Choose a passphrase.' }),
    ).toMatchObject({
      explanationText: localized('# Privacy\n\nChoose a passphrase.'),
    });
  });

  it('escapes the title so it shows as written', () => {
    expect(
      migratedExplanation({
        title: '*New* rules [v2] #',
        body: 'Choose a passphrase.',
      }),
    ).toMatchObject({
      explanationText: localized(
        '# \\*New\\* rules \\[v2\\] \\#\n\nChoose a passphrase.',
      ),
    });
  });

  it('puts a title written on several lines on one line', () => {
    expect(
      migratedExplanation({
        title: ' Keep this\nprivate ',
        body: 'Choose a passphrase.',
      }),
    ).toMatchObject({
      explanationText: localized('# Keep this private\n\nChoose a passphrase.'),
    });
  });

  it.each(BLANK_TEXT)('leaves out a title of %s', (_, title) => {
    expect(
      migratedExplanation({ title, body: 'Choose a passphrase.' }),
    ).toMatchObject({ explanationText: localized('Choose a passphrase.') });
  });

  it('keeps the title alone when the text shows nothing', () => {
    expect(migratedExplanation({ title: 'Privacy', body: ' ' })).toMatchObject({
      explanationText: localized('# Privacy'),
    });
  });
});

type Schema8Stage = Record<string, unknown>;

// The base protocol as schema 8 stored it, with the given stages after its
// own. Each stage is written in schema 8 form, so its text is plain strings.
const schema8WithStages = (...stages: Schema8Stage[]) => {
  const document = asSchema8Protocol(createBaseProtocol());
  return { ...document, stages: [...document.stages, ...stages] };
};

// An Ego Form opening on an introduction panel, as schema 8 stored it, with
// the panel's title and text as given (`undefined` leaves the key out).
const egoFormWithPanel = (
  panel: { title?: string; text?: string },
  label = 'About you',
): Schema8Stage => ({
  id: testId('ego-form'),
  type: 'EgoForm',
  label,
  introductionPanel: {
    ...(panel.title !== undefined && { title: panel.title }),
    ...(panel.text !== undefined && { text: panel.text }),
  },
  form: { fields: [{ variable: 'egoName', prompt: 'Your name?' }] },
});

const alterFormWithPanel = (
  panel: { title: string; text?: string },
  extra: Schema8Stage = {},
): Schema8Stage => ({
  id: testId('alter-form'),
  type: 'AlterForm',
  label: 'About them',
  subject: { entity: 'node', type: 'person' },
  introductionPanel: panel,
  form: { fields: [{ variable: 'name', prompt: 'Their name?' }] },
  ...extra,
});

// The stage just before the stage `id`, where the migration puts the
// Information stage it makes from that stage's introduction panel.
const migratedStageBefore = (
  document: unknown,
  id: string,
  migrated = migrateReadable(document, 9),
) => {
  const newId = migratedStageId(document, migrated, id);
  const { stages } = migrated;
  return stages[stages.findIndex((stage) => stage.id === newId) - 1];
};

// The stages the migration step itself gives, before validation.
const stagesMigratedFrom = (document: unknown): unknown[] => {
  const { stages } = withOriginalCodebookKeys(
    migrationV8toV9.migrate(ProtocolSchemaV8.parse(document), {}),
    document,
  );
  return Array.isArray(stages) ? stages : [];
};

// `value` with every `id` key removed, for comparing what the migration gives
// apart from the ids it chooses.
const withoutIds = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(withoutIds)
    : typeof value === 'object' && value !== null
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => key !== 'id')
            .map(([key, child]) => [key, withoutIds(child)]),
        )
      : value;

const objectWithoutIds = (value: object): object => {
  const stripped = withoutIds(value);
  return typeof stripped === 'object' && stripped !== null ? stripped : {};
};

const stageIds = (stages: readonly unknown[]) =>
  stages.map((stage) => (stage as { id?: unknown }).id);

const stageTypes = (stages: readonly unknown[]) =>
  stages.map((stage) => (stage as { type?: unknown }).type);

describe('Migrating introduction panels from schema 8 to 9', () => {
  it.each([
    ['AlterForm', {}],
    ['AlterEdgeForm', { subject: { entity: 'edge', type: 'knows' } }],
    [
      'DyadCensus',
      {
        prompts: [
          { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
        ],
      },
    ],
    [
      'TieStrengthCensus',
      {
        prompts: [
          {
            id: 'p1',
            text: 'How close are they?',
            createEdge: 'knows',
            edgeVariable: 'closeness',
            negativeLabel: 'Not at all',
          },
        ],
      },
    ],
  ] as const)(
    "moves a %s's panel to an Information stage just before it",
    async (type, settings) => {
      const { form: _form, ...stage } = alterFormWithPanel({
        title: 'Welcome',
        text: 'Some questions about them.',
      });
      const document = schema8WithStages({
        ...stage,
        ...(type === 'AlterForm' || type === 'AlterEdgeForm'
          ? {
              form: {
                fields: [
                  {
                    variable: type === 'AlterForm' ? 'name' : 'duration',
                    prompt: 'A question?',
                  },
                ],
              },
            }
          : {}),
        type,
        ...settings,
      });
      const migrated = migrateReadable(document, 9);

      expect(
        (await validateProtocol(withTestCodebookIds(migrated))).success,
      ).toBe(true);
      expect(stageTypes(migrated.stages)).toEqual([
        'NameGenerator',
        'Sociogram',
        'Information',
        type,
        'FinishSession',
      ]);
      expect(migrated.stages[3]?.id).toBe(
        migratedStageId(document, migrated, testId('alter-form')),
      );
      expect(migrated.stages[2]).toEqual({
        id: expect.any(String),
        type: 'Information',
        label: localized('Welcome'),
        content: localized('# Welcome\n\nSome questions about them.'),
      });
      expect(migrated.stages[3]).not.toHaveProperty('introductionPanel');
    },
  );

  it('gives a panel with only a title an Information stage with only a title', () => {
    expect(
      migratedStageBefore(
        schema8WithStages(alterFormWithPanel({ title: 'Welcome' })),
        testId('alter-form'),
      ),
    ).toMatchObject({ content: localized('# Welcome') });
  });

  it('shows or skips the Information stage with its stage', () => {
    const skipLogic = {
      action: 'SKIP',
      filter: {
        rules: [
          {
            type: 'ego',
            id: testId('rule-1'),
            options: { attribute: 'egoName', operator: 'EXISTS' },
          },
        ],
      },
    };
    const document = schema8WithStages(
      alterFormWithPanel({ title: 'Welcome' }, { skipLogic }),
    );

    const migrated = migrateReadable(document, 9);
    const information = migratedStageBefore(
      document,
      testId('alter-form'),
      migrated,
    );
    const alterForm = findMigratedStage(
      document,
      testId('alter-form'),
      migrated,
    );

    expect(withoutIds(information)).toHaveProperty(
      'skipLogic',
      withoutIds(skipLogic),
    );
    expect(withoutIds(alterForm)).toHaveProperty(
      'skipLogic',
      withoutIds(skipLogic),
    );
    // Each copy of the rule has an id of its own.
    expect(information).not.toHaveProperty(
      'skipLogic.filter.rules.0.id',
      alterForm?.skipLogic?.filter?.rules?.[0]?.id,
    );
  });

  it('lands a skip that jumped to the stage on its Information stage', () => {
    const document = schema8WithStages(
      {
        id: testId('info'),
        type: 'Information',
        label: 'Info',
        title: 'Info',
        items: [],
        skipLogic: {
          action: 'SKIP',
          filter: {
            rules: [
              {
                type: 'ego',
                id: testId('rule-1'),
                options: { attribute: 'egoName', operator: 'EXISTS' },
              },
            ],
          },
          destination: { type: 'stage', stageId: testId('alter-form') },
        },
      },
      alterFormWithPanel({ title: 'Welcome' }),
    );

    const migrated = migrateReadable(document, 9);

    expect(
      findMigratedStage(document, testId('info'), migrated),
    ).toHaveProperty('skipLogic.destination', {
      type: 'stage',
      stageId: migratedStageBefore(document, testId('alter-form'), migrated)
        ?.id,
    });
  });

  it('gives each Information stage an id no other object has', () => {
    const stages = stagesMigratedFrom(
      schema8WithStages(
        alterFormWithPanel({ title: 'Welcome' }),
        alterFormWithPanel({ title: 'Welcome' }, { id: testId('second') }),
      ),
    );
    const ids = stageIds(stages);

    expect(new Set(ids).size).toBe(ids.length);
    expect(stageTypes(stages).slice(2)).toEqual([
      'Information',
      'AlterForm',
      'Information',
      'AlterForm',
      'FinishSession',
    ]);
  });

  it("keeps an Ego Form's panel where it is, above its questions", async () => {
    const migrated = migrateReadable(
      schema8WithStages(egoFormWithPanel({ title: 'Welcome', text: 'Hello' })),
      9,
    );

    expect(
      (await validateProtocol(withTestCodebookIds(migrated))).success,
    ).toBe(true);
    expect(stageTypes(migrated.stages)).toEqual([
      'NameGenerator',
      'Sociogram',
      'EgoForm',
      'FinishSession',
    ]);
    expect(migrated.stages[2]).toMatchObject({
      introductionPanel: {
        title: localized('Welcome'),
        text: localized('Hello'),
      },
    });
    expect(migrated.stages[2]).not.toHaveProperty('form.title');
  });

  // Published protocols (SIXHUMENE Waves 1-3) give a panel a body of a single
  // space on purpose, to show only its title.
  it.each(BLANK_TEXT)(
    "removes an Ego Form's panel text of %s, so it shows only its title",
    (_, text) => {
      const stage = findMigratedStage(
        schema8WithStages(egoFormWithPanel({ title: 'Welcome', text })),
        testId('ego-form'),
      );

      expect(stage).toMatchObject({
        introductionPanel: { title: localized('Welcome') },
      });
      expect(stage).not.toHaveProperty('introductionPanel.text');
    },
  );

  it.each(BLANK_TEXT)(
    'leaves out text of %s, so the Information stage shows only its title',
    (_, text) => {
      expect(
        migratedStageBefore(
          schema8WithStages(alterFormWithPanel({ title: 'Welcome', text })),
          testId('alter-form'),
        ),
      ).toMatchObject({ content: localized('# Welcome') });
    },
  );

  it('keeps text that says something, padded or not', () => {
    expect(
      findMigratedStage(
        schema8WithStages(
          egoFormWithPanel({ title: 'Welcome', text: ' Hello ' }),
        ),
        testId('ego-form'),
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
        findMigratedStage(
          schema8WithStages(egoFormWithPanel({ title, text: 'Hello' })),
          testId('ego-form'),
        ),
      ).toMatchObject({
        introductionPanel: {
          title: localized('About you'),
          text: localized('Hello'),
        },
      });
      expect(
        migratedStageBefore(
          schema8WithStages(alterFormWithPanel({ title, text: 'Hello' })),
          testId('alter-form'),
        ),
      ).toMatchObject({ content: localized('# About them\n\nHello') });
    },
  );

  // A blank stage label is first named "Stage" and its position, as the 7 to
  // 8 migration names a stage with none, and the panel takes that name.
  it('gives a blank title the repaired stage name when the stage label is blank as well', () => {
    const stages = stagesMigratedFrom(
      schema8WithStages(egoFormWithPanel({ title: ' ', text: ' ' }, ' ')),
    );
    const position = stages.length - 1;
    expect(stages.at(-2)).toHaveProperty(
      'label',
      localized(`Stage ${position}`),
    );
    expect(stages.at(-2)).toHaveProperty('introductionPanel', {
      title: localized(`Stage ${position}`),
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
          id: testId('ego-1'),
          type: 'EgoForm',
          label: 'About you',
          introductionPanel: { title: ' ', text: ' ' },
          form: { fields: [{ variable: 'age', prompt: 'How old are you?' }] },
        },
        {
          id: testId('ego-2'),
          type: 'EgoForm',
          label: ' ',
          introductionPanel: { title: '\t', text: 'Some more questions.' },
          form: { fields: [{ variable: 'age', prompt: 'Still that old?' }] },
        },
        {
          id: testId('alter-1'),
          type: 'AlterForm',
          label: 'About them',
          subject: { entity: 'node', type: 'person' },
          introductionPanel: { title: ' ', text: '\n' },
          form: { fields: [{ variable: 'name', prompt: 'Their name?' }] },
        },
      ],
    };

    const migrated = migrateReadable(v5Protocol, 9, { name: 'Blank panels' });
    const result = await validateProtocol(withTestCodebookIds(migrated));

    expect(result.success).toBe(true);
    expect(migrated.stages.slice(0, 4)).toMatchObject([
      {
        label: localized('About you'),
        introductionPanel: { title: localized('About you') },
      },
      {
        label: localized('Stage 2'),
        introductionPanel: {
          title: localized('Stage 2'),
          text: localized('Some more questions.'),
        },
      },
      { type: 'Information', content: localized('# About them') },
      { type: 'AlterForm', label: localized('About them') },
    ]);
    expect(migrated.stages[0]).not.toHaveProperty('introductionPanel.text');
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
        id: testId('bin'),
        type: 'CategoricalBin' as const,
        label: localized('Sort them'),
        subject: { entity: 'node' as const, type: 'person' },
        prompts: [
          {
            id: testId('bin-prompt'),
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
  const stage = document.stages.find(({ id }) => id === testId('bin'));
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
  const stage = findMigratedStage(schema8WithOtherBin(other), testId('bin'));
  return stage && 'prompts' in stage ? stage.prompts[0] : undefined;
};

// The places schema 9 reports when migrating the document fails.
const migrationIssuePaths = (document: unknown) => {
  try {
    migrateReadable(document, 9);
  } catch (error) {
    if (error instanceof MigrationResultInvalidError) {
      return error.issues.map(({ path }) => path);
    }
    throw error;
  }
  return [];
};

describe('Migrating the text of a Categorical Bin "other" bin from schema 8 to 9', () => {
  // The caption is a label, so it takes the 7 to 8 default, not the question.
  it.each(BLANK_TEXT)('gives a caption of %s "Other"', (_, blank) => {
    expect(
      migratedOtherBin({
        otherOptionLabel: blank,
        otherVariablePrompt: 'What else?',
      }),
    ).toMatchObject({
      otherOptionLabel: localized('Other'),
      otherVariablePrompt: localized('What else?'),
    });
  });

  // The question is the protocol's own content, which the migration never
  // writes, so the document is refused at the question.
  it.each(BLANK_TEXT)(
    'refuses a question of %s at the question',
    (_, blank) => {
      expect(
        migrationIssuePaths(
          schema8WithOtherBin({
            otherOptionLabel: 'Something else',
            otherVariablePrompt: blank,
          }),
        ),
      ).toContainEqual([
        'stages',
        expect.any(Number),
        'prompts',
        0,
        'otherVariablePrompt',
      ]);
    },
  );

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
        id: testId('tie-strength'),
        type: 'TieStrengthCensus' as const,
        label: localized('Rate them'),
        subject: { entity: 'node' as const, type: 'person' },
        introductionPanel: {
          title: localized('Rate them'),
          text: localized('Rate each pair.'),
        },
        prompts: [
          {
            id: testId('tie-strength-prompt'),
            text: localized('How close are these people?'),
            createEdge: 'knows',
            edgeVariable: 'closeness',
            negativeLabel: localized('Placeholder'),
          },
        ],
      },
    ],
  });
  const stage = document.stages.find(({ id }) => id === testId('tie-strength'));
  if (!stage || !('prompts' in stage)) throw new Error('No census');
  const [prompt] = stage.prompts as Record<string, unknown>[];
  if (!prompt) throw new Error('No census prompt');
  prompt.negativeLabel = negativeLabel;
  const migrated = findMigratedStage(document, testId('tie-strength'));
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
});

// The base protocol with an Information stage whose title is given, as
// schema 8 stored it.
const migratedInformationTitle = (title: string) => {
  const base = createBaseProtocol();
  const document = asSchema8Protocol({
    ...base,
    stages: [
      {
        id: testId('welcome'),
        type: 'Information' as const,
        label: localized('Welcome'),
        title: localized('Placeholder'),
        items: [
          {
            id: testId('item'),
            type: 'text' as const,
            content: localized('Hi'),
          },
        ],
      },
      ...base.stages,
    ],
  });
  const stage = document.stages.find(({ id }) => id === testId('welcome'));
  if (!stage) throw new Error('No Information stage');
  (stage as Record<string, unknown>).title = title;
  return findMigratedStage(document, testId('welcome'));
};

describe('Migrating an Information stage title from schema 8 to 9', () => {
  // The page shows its text with no heading above it, as it showed before.
  it.each(BLANK_TEXT)(
    'leaves out a title of %s, leaving the rest of the page',
    (_, blank) => {
      expect(migratedInformationTitle(blank)).toMatchObject({
        content: localized('Hi'),
      });
    },
  );

  it('keeps a title that says something, as the heading of the page', () => {
    expect(migratedInformationTitle('Hello')).toMatchObject({
      content: localized('# Hello\n\nHi'),
    });
  });

  it('removes the title and items the page was held in', () => {
    const stage = migratedInformationTitle('Hello');
    expect(stage).not.toHaveProperty('title');
    expect(stage).not.toHaveProperty('items');
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
        id: testId('narrative'),
        type: 'Narrative' as const,
        label: localized('Tell the story'),
        subject: { entity: 'node' as const, type: 'person' },
        presets: [
          {
            id: testId('first'),
            label: localized('Placeholder'),
            layoutVariable: 'layoutPosition',
          },
          {
            id: testId('second'),
            label: localized('Placeholder'),
            layoutVariable: 'layoutPosition',
          },
        ],
        background: { concentricCircles: 3 },
        behaviours: {},
      },
    ],
  });
  const stage = document.stages.find(({ id }) => id === testId('narrative'));
  if (!stage || !('presets' in stage)) throw new Error('No Narrative stage');
  const presets = stage.presets as Record<string, unknown>[];
  for (const preset of presets) preset.label = label;
  return findMigratedStage(document, testId('narrative'));
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
});

// A schema 8 Narrative stage with two presets, holding the settings given.
const schema8Narrative = (settings: Record<string, unknown>) => ({
  ...createBaseProtocol(),
  schemaVersion: 8,
  stages: [
    {
      id: testId('narrative'),
      type: 'Narrative',
      label: 'Tell the story',
      subject: { entity: 'node', type: 'person' },
      presets: [
        {
          id: testId('first'),
          label: 'Closeness',
          layoutVariable: 'layoutPosition',
        },
        {
          id: testId('second'),
          label: 'Support',
          layoutVariable: 'layoutPosition',
        },
      ],
      background: { concentricCircles: 3 },
      ...settings,
    },
  ],
});

describe('Migrating a Narrative stage filter from schema 8 to 9', () => {
  const filter = { join: 'AND', rules: [nameRule, ageRule] };

  it('copies the stage filter to every preset, and leaves the stage none', () => {
    const [stage] = stagesMigratedFrom(schema8Narrative({ filter }));

    expect(withoutIds(stage)).toMatchObject({
      presets: [{ filter: withoutIds(filter) }, { filter: withoutIds(filter) }],
    });
    expect(stage).not.toHaveProperty('filter');
  });

  it('gives each preset a copy of its own', () => {
    const [stage] = stagesMigratedFrom(schema8Narrative({ filter }));
    const [first, second] = (stage as { presets: { filter: object }[] })
      .presets;

    expect(first?.filter).not.toBe(second?.filter);
  });

  it('gives a preset no filter where the stage had none', () => {
    const [stage] = stagesMigratedFrom(schema8Narrative({}));

    expect(stage).not.toHaveProperty('presets.0.filter');
    expect(stage).not.toHaveProperty('presets.1.filter');
  });

  it('produces a protocol schema 9 accepts', () => {
    const result = ProtocolSchemaV9.safeParse(
      migrateProtocol(schema8Narrative({ filter }), 9),
    );

    expect(result.error?.issues ?? []).toEqual([]);
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
  const stage = document.stages.find(
    ({ id }) => id === testId('nameGenerator1'),
  );
  if (!stage || !('form' in stage)) throw new Error('No Name Generator');
  (stage.form as Record<string, unknown>).title = title;
  const migrated = findMigratedStage(document, testId('nameGenerator1'));
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
        id: testId('welcome'),
        type: 'Information' as const,
        label: localized('Welcome'),
        title: localized('Welcome'),
        items: [
          {
            id: testId('first'),
            type: 'text' as const,
            content: localized('Hi'),
          },
          {
            id: testId('second'),
            type: 'text' as const,
            content: localized('Bye'),
          },
        ],
      },
      ...base.stages,
    ],
  });
  const stage = document.stages.find(({ id }) => id === testId('welcome'));
  if (!stage || !('items' in stage)) throw new Error('No Information stage');
  const [first] = stage.items as Record<string, unknown>[];
  if (!first) throw new Error('No text item');
  first.content = content;
  const migrated = findMigratedStage(document, testId('welcome'));
  return migrated && 'content' in migrated ? migrated.content : undefined;
};

describe('Migrating Information text items from schema 8 to 9', () => {
  it.each(BLANK_TEXT)('leaves out an item of %s', (_, blank) => {
    expect(migratedInformationItems(blank)).toEqual(
      localized('# Welcome\n\nBye'),
    );
  });

  it('keeps an item that says something, in its place on the page', () => {
    expect(migratedInformationItems('Hello')).toEqual(
      localized('# Welcome\n\nHello\n\nBye'),
    );
  });
});

// The base protocol with its Name Generator form field hinted as given.
const migratedHint = (hint: string) => {
  const base = createBaseProtocol();
  const document = asSchema8Protocol(base) as Record<string, unknown>;
  const stage = (document.stages as Record<string, unknown>[])[0];
  const form = stage?.form as Record<string, unknown> | undefined;
  const [field] = (form?.fields ?? []) as Record<string, unknown>[];
  if (!field) throw new Error('No form field');
  field.hint = hint;
  const migrated = findMigratedStage(document, testId('nameGenerator1'));
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
    const migrated = migrateReadable(document, 9);

    expect(migrated.codebook.ego?.variables?.egoCloseness).toMatchObject({
      parameters: { minLabel: localized('Not close') },
    });
    expect(migrated.codebook.ego?.variables?.egoCloseness).not.toHaveProperty(
      'parameters.maxLabel',
    );
  });
});

describe('Migrating protocol object ids from schema 8 to 9', () => {
  // A UUID a schema 8 author could already have given an object.
  const KEPT = testId('kept');

  const formStages = (): Schema8Stage[] => [
    {
      id: testId('ego-form'),
      type: 'EgoForm',
      label: 'About you',
      introductionPanel: { title: 'About you', text: 'Please answer.' },
      form: {
        fields: [
          { variable: 'egoName', prompt: 'Your name?' },
          { id: KEPT, variable: 'egoAge', prompt: 'Your age?' },
        ],
      },
    },
    {
      id: 'alter-form',
      type: 'AlterForm',
      label: 'About them',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'About them' },
      form: {
        fields: [
          { id: 'field-1', variable: 'name', prompt: 'Their name?' },
          { id: 'field-1', variable: 'age', prompt: 'Their age?' },
        ],
      },
    },
    {
      id: 'name-generator',
      type: 'NameGenerator',
      label: 'Add people',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        { id: 'p1', text: 'Who do you know?' },
        { id: 'p2', text: 'Who else?' },
      ],
      form: {
        title: 'Add a person',
        fields: [{ variable: 'name', prompt: 'Name?' }],
      },
      skipLogic: {
        action: 'SKIP',
        filter: {
          rules: [
            {
              type: 'ego',
              id: testId('rule-1'),
              options: { attribute: 'egoName', operator: 'EXISTS' },
            },
          ],
        },
        destination: { type: 'stage', stageId: 'name-generator-2' },
      },
    },
    {
      id: 'name-generator-2',
      type: 'NameGenerator',
      label: 'Add more people',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Who do you work with?' }],
      form: {
        title: 'Add a person',
        fields: [{ variable: 'name', prompt: 'Name?' }],
      },
    },
  ];

  const migrated = (document: unknown = schema8WithStages(...formStages())) =>
    migrateReadable(document, 9);

  const fieldIds = (stage: unknown): unknown[] => {
    const { form } = stage as { form?: { fields?: unknown } };
    const fields: unknown[] = Array.isArray(form?.fields) ? form.fields : [];
    return fields.map((field) => (field as { id?: unknown }).id);
  };

  // Every value written under an `id` key anywhere in `document`.
  const idsWritten = (document: unknown): Set<unknown> => {
    const ids = new Set<unknown>();
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (typeof value === 'object' && value !== null) {
        for (const [key, child] of Object.entries(value)) {
          if (key === 'id') ids.add(child);
          visit(child);
        }
      }
    };
    visit(document);
    return ids;
  };

  // The stage labelled `label`, not the Information stage the migration
  // makes from its introduction panel, which takes the same label.
  const stageLabelled = (
    protocol: {
      stages: readonly { id: string; type: string; label: unknown }[];
    },
    label: string,
  ) =>
    protocol.stages.find(
      (stage) =>
        stage.type !== 'Information' &&
        JSON.stringify(stage.label) === JSON.stringify(localized(label)),
    );

  it('gives every object a UUID that no other object in the protocol has', () => {
    const protocol = migrated();
    const ids = collectProtocolObjectIds(protocol).map(({ id }) => id);

    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(isProtocolObjectId(id)).toBe(true);
    expect(findDuplicateProtocolObjectIds(protocol)).toEqual([]);
  });

  it('gives every object a new id, even one that was already a UUID', () => {
    const document = schema8WithStages(...formStages());
    const before = idsWritten(document);
    const protocol = migrated(document);

    expect(before.has(testId('ego-form'))).toBe(true);
    expect(before.has(KEPT)).toBe(true);
    for (const { id } of collectProtocolObjectIds(protocol)) {
      expect(before.has(id)).toBe(false);
    }
  });

  it('gives each of two fields that shared an id one of its own', () => {
    const protocol = migrated();
    const [first, second] = fieldIds(stageLabelled(protocol, 'About them'));

    expect(isProtocolObjectId(first)).toBe(true);
    expect(isProtocolObjectId(second)).toBe(true);
    expect(second).not.toBe(first);
  });

  it('gives each use of a UUID repeated in different forms of one stage an id of its own', () => {
    const protocol = migrated(
      schema8WithStages({
        id: testId('composer'),
        type: 'NetworkComposer',
        label: 'Compose',
        subject: { entity: 'node', type: 'person' },
        quickAdd: 'name',
        layoutVariable: 'layoutPosition',
        background: { concentricCircles: 1 },
        nodeForm: {
          fields: [{ id: KEPT, variable: 'age', component: 'Number' }],
        },
        edges: [
          {
            id: testId('knows-edge'),
            subject: { entity: 'edge', type: 'knows' },
            form: {
              fields: [
                { id: KEPT, variable: 'closeness', component: 'RadioGroup' },
              ],
            },
          },
        ],
      }),
    );
    const composer = protocol.stages[2] as {
      nodeForm: { fields: { id: string }[] };
      edges: { id: string; form: { fields: { id: string }[] } }[];
    };
    const nodeFieldId = composer.nodeForm.fields[0]?.id;
    const edgeFieldId = composer.edges[0]?.form.fields[0]?.id;

    expect(isProtocolObjectId(nodeFieldId)).toBe(true);
    expect(isProtocolObjectId(edgeFieldId)).toBe(true);
    expect(nodeFieldId).not.toBe(edgeFieldId);
    expect([nodeFieldId, edgeFieldId]).not.toContain(KEPT);
    expect(findDuplicateProtocolObjectIds(protocol)).toEqual([]);
  });

  it('points a skip at the new id of the stage it names', () => {
    const protocol = migrated();
    const target = stageLabelled(protocol, 'Add more people');
    const skipping = stageLabelled(protocol, 'Add people');

    expect(target?.id).not.toBe('name-generator-2');
    expect(skipping).toHaveProperty('skipLogic.destination', {
      type: 'stage',
      stageId: target?.id,
    });
  });

  it('gives the stages it adds UUIDs instead of readable ids', () => {
    const protocol = migrated();

    expect(protocol.stages.at(-1)).toMatchObject({ type: 'FinishSession' });
    for (const stage of protocol.stages) {
      expect(isProtocolObjectId(stage.id)).toBe(true);
    }
    expect(JSON.stringify(protocol)).not.toMatch(
      /"(finish|introduction-text|field-\d+|[^"]*-introduction)"/,
    );
  });

  it('never changes the document it is given', () => {
    const document = deepFreeze(schema8WithStages(...formStages()));
    const copy = structuredClone(document);

    expect(() => migrated(document)).not.toThrow();
    expect(document).toEqual(copy);
  });
});

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

describe('Migrating edge types from schema 8 to 9', () => {
  // Schema 8 never wrote these keys, but its edge types accepted any key,
  // so a hand-edited file could carry them.
  const schema8WithDirectedKnows = (...stages: Schema8Stage[]) => {
    const base = createBaseProtocol();
    const document = asSchema8Protocol({
      ...base,
      codebook: {
        ...base.codebook,
        edge: {
          ...base.codebook.edge,
          knows: {
            ...base.codebook.edge.knows,
            directed: true,
            endpointRules: [{ sourceType: 'person', targetType: 'person' }],
          },
        },
      },
    });
    return { ...document, stages: [...document.stages, ...stages] };
  };

  it('leaves an edge type undirected with no rules when the schema 8 file carries those keys', () => {
    const migrated = migrateReadable(schema8WithDirectedKnows(), 9);

    expect(migrated.codebook.edge?.knows).toEqual(
      migratedBase().codebook.edge?.knows,
    );
  });

  it('migrates a stage that draws such an edge type', () => {
    const document = schema8WithDirectedKnows({
      id: testId('dyad-census'),
      type: 'DyadCensus',
      label: 'Who knows whom',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
      ],
    });

    expect(() => migrateReadable(document, 9)).not.toThrow();
  });
});
