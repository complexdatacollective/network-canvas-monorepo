import { describe, expect, it } from 'vitest';

import {
  getMigrationInfo,
  migrateProtocol,
} from '../../../migration/migrate-protocol.ts';
import { createBaseProtocol, localized } from '../../../utils/test-utils.ts';
import ProtocolSchemaV8 from '../../8/schema.ts';
import ProtocolSchemaV9 from '../schema.ts';
import { asSchema8Protocol } from './schema-8-protocol.ts';

// The base protocol with its `person.name` attribute marked encrypted, under
// the given experiments.
const protocolWithEncryptedName = (
  experiments: { encryptedVariables?: boolean } | undefined,
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
  experiments: { encryptedVariables?: boolean } | undefined,
) => asSchema8Protocol(protocolWithEncryptedName(experiments));

// The base protocol, never encrypted, as the migration leaves it.
const migratedBase = () =>
  migrateProtocol(asSchema8Protocol(createBaseProtocol()), 9);

describe('Migrating encrypted attributes from schema 8 to 9', () => {
  it('keeps them encrypted when the experiment was on', () => {
    const migrated = migrateProtocol(
      schema8WithEncryptedName({ encryptedVariables: true }),
      9,
    );

    expect(migrated.codebook.node?.person?.variables?.name).toMatchObject({
      encrypted: true,
    });
    expect(Object.hasOwn(migrated, 'experiments')).toBe(false);
  });

  it.each([
    ['absent', undefined],
    ['empty', {}],
    ['off', { encryptedVariables: false }],
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
      expect(Object.hasOwn(migrated, 'experiments')).toBe(false);
    },
  );

  it('changes nothing else in the codebook', () => {
    const migrated = migrateProtocol(schema8WithEncryptedName(undefined), 9);

    expect(migrated.codebook).toEqual(migratedBase().codebook);
  });
});

describe('The experiments setting', () => {
  it('is still accepted by schema 8', () => {
    const protocol = schema8WithEncryptedName({ encryptedVariables: true });
    expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(true);
  });

  it('is refused by schema 9, which always encrypts', () => {
    const protocol = {
      ...protocolWithEncryptedName({ encryptedVariables: true }),
      schemaVersion: 9,
    };
    const result = ProtocolSchemaV9.safeParse(protocol);

    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        code: 'unrecognized_keys',
        keys: ['experiments'],
      }),
    );
  });

  it('is not needed by schema 9 to keep an attribute encrypted', () => {
    const { experiments: _experiments, ...protocol } =
      protocolWithEncryptedName({ encryptedVariables: true });
    expect(
      ProtocolSchemaV9.safeParse({ ...protocol, schemaVersion: 9 }).success,
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

    expect(migrated.stages.at(-1)).toMatchObject({
      type: 'Anonymisation',
      validation,
    });
  });

  it('says so in the migration notes', () => {
    const note = getMigrationInfo(8).notes.find(({ version }) => version === 9);

    expect(note?.notes).toContain(
      'If an Anonymisation stage required a minimum passphrase length longer than its maximum',
    );
  });
});
