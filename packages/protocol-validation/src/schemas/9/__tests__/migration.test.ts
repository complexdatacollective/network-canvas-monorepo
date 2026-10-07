import { describe, expect, it } from 'vitest';

import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';
import ProtocolSchemaV8 from '../../8/schema.ts';
import ProtocolSchemaV9 from '../schema.ts';

// The base protocol with its `person.name` attribute marked encrypted, as
// schema 8 stored it, under the given experiments.
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

describe('Migrating encrypted attributes from schema 8 to 9', () => {
  it('keeps them encrypted when the experiment was on', () => {
    const migrated = migrateProtocol(
      protocolWithEncryptedName({ encryptedVariables: true }),
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
      const source = protocolWithEncryptedName(experiments);
      const migrated = migrateProtocol(source, 9);

      const { encrypted: _encrypted, ...unmarked } =
        source.codebook.node.person.variables.name;
      expect(migrated.codebook.node?.person?.variables?.name).toEqual(unmarked);
      expect(Object.hasOwn(migrated, 'experiments')).toBe(false);
    },
  );

  it('changes nothing else in the codebook', () => {
    const source = protocolWithEncryptedName(undefined);
    const migrated = migrateProtocol(source, 9);

    expect(migrated.codebook).toEqual(createBaseProtocol().codebook);
  });
});

describe('The experiments setting', () => {
  it('is still accepted by schema 8', () => {
    const protocol = protocolWithEncryptedName({ encryptedVariables: true });
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
