import { describe, expect, it } from 'vitest';

import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import { createBaseProtocol, localized } from '../../../utils/test-utils.ts';
import ProtocolSchemaV9 from '../schema.ts';

type Variables = Record<string, { name: string; [key: string]: unknown }>;

const renameVariables = (
  variables: Variables,
  renames: Record<string, string>,
): Variables =>
  Object.fromEntries(
    Object.entries(variables).map(([id, variable]) => [
      id,
      id in renames ? { ...variable, name: renames[id] ?? '' } : variable,
    ]),
  );

// The base protocol with variables renamed: `node` renames the `person` node
// type's variables, `edge` the `knows` edge type's, `ego` the ego's.
const protocolWithNames = (
  schemaVersion: 8 | 9,
  renames: {
    node?: Record<string, string>;
    edge?: Record<string, string>;
    ego?: Record<string, string>;
  },
) => {
  const base = createBaseProtocol();
  const { person } = base.codebook.node;
  const { knows } = base.codebook.edge;
  return {
    ...base,
    schemaVersion,
    codebook: {
      ...base.codebook,
      node: {
        ...base.codebook.node,
        person: {
          ...person,
          variables: renameVariables(person.variables, renames.node ?? {}),
        },
      },
      edge: {
        ...base.codebook.edge,
        knows: {
          ...knows,
          variables: renameVariables(knows.variables, renames.edge ?? {}),
        },
      },
      ego: {
        variables: renameVariables(
          base.codebook.ego.variables,
          renames.ego ?? {},
        ),
      },
    },
  };
};

const issuePaths = (result: {
  error?: { issues: { path: PropertyKey[] }[] };
}) => result.error?.issues.map(({ path }) => path.join('.'));

describe('Schema 9 attribute names', () => {
  it('accepts the base protocol', () => {
    expect(ProtocolSchemaV9.safeParse(protocolWithNames(9, {})).success).toBe(
      true,
    );
  });

  it.each([
    '名前',
    'Prénom',
    'naïve',
    'имя',
    'اسم',
    'first name',
    'Age (years)',
    'How close?',
    'a/b, c & d',
  ])('accepts %j', (name) => {
    const protocol = protocolWithNames(9, {
      node: { name },
      edge: { duration: name },
      ego: { egoName: name },
    });
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['leading space', ' name'],
    ['trailing space', 'name '],
    ['tab', 'first\tname'],
    ['line break', 'first\nname'],
    ['null character', 'name\u0000'],
    ['decomposed accent', 'namé'],
    ['noncharacter', 'name￿'],
    ['lone surrogate', 'name\uD800'],
  ])('rejects a name with a %s', (_description, name) => {
    const result = ProtocolSchemaV9.safeParse(
      protocolWithNames(9, { node: { name } }),
    );
    expect(issuePaths(result)).toContain(
      'codebook.node.person.variables.name.name',
    );
  });

  it('still rejects two attributes of one entity with the same name', () => {
    const result = ProtocolSchemaV9.safeParse(
      protocolWithNames(9, { node: { name: '名前', age: '名前' } }),
    );
    expect(result.success).toBe(false);
  });

  it('keeps attribute record keys to the id alphabet', () => {
    const base = protocolWithNames(9, {});
    const { person } = base.codebook.node;
    const result = ProtocolSchemaV9.safeParse({
      ...base,
      codebook: {
        ...base.codebook,
        node: {
          ...base.codebook.node,
          person: {
            ...person,
            variables: {
              ...person.variables,
              'nombre completo': {
                name: 'Nombre completo',
                label: localized('Nombre completo'),
                type: 'text',
              },
            },
          },
        },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('Schema 8 attribute names', () => {
  it('migrates a version 8 document holding names only schema 9 accepts, and the result validates', () => {
    const migrated = migrateProtocol(
      protocolWithNames(8, {
        node: { name: '名前' },
        edge: { duration: 'first name' },
        ego: { egoName: 'Age (years)' },
      }),
    );

    expect(migrated.schemaVersion).toBe(9);
    expect(migrated.codebook.node?.person?.variables?.name?.name).toBe('名前');
    expect(migrated.codebook.edge?.knows?.variables?.duration?.name).toBe(
      'first name',
    );
    expect(migrated.codebook.ego?.variables?.egoName?.name).toBe('Age (years)');
    expect(ProtocolSchemaV9.safeParse(migrated).success).toBe(true);
  });
});
