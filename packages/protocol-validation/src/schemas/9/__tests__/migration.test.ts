import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { MigrationResultInvalidError } from '../../../migration/errors.ts';
import {
  getMigrationInfo,
  migrateProtocol,
} from '../../../migration/migrate-protocol.ts';
import { createBaseProtocol, localized } from '../../../utils/test-utils.ts';
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
