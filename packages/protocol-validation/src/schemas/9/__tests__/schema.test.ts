import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { parseIssues } from '../../../__tests__/schemaIssues.ts';
import {
  testTypeId,
  testVariableId,
  withOriginalCodebookKeys,
} from '../../../__tests__/testIds.ts';
import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import { createBaseProtocol, localized } from '../../../utils/test-utils.ts';
import ProtocolSchemaV8 from '../../8/schema.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { asSchema8Protocol } from './schema-8-protocol.ts';

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
const protocolWithNames = (renames: {
  node?: Record<string, string>;
  edge?: Record<string, string>;
  ego?: Record<string, string>;
}) => {
  const base = createBaseProtocol();
  const { person } = base.codebook.node;
  const { knows } = base.codebook.edge;
  return {
    ...base,
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

describe('Schema 9 attribute names', () => {
  const personVariables = `codebook.node.${testTypeId('person')}.variables`;
  const namePath = `${personVariables}.${testVariableId('name')}.name`;
  const refused = (message: string) => ({
    path: namePath,
    code: 'custom',
    message,
  });
  const padded = refused('A name cannot start or end with whitespace');
  const control = refused(
    'A name cannot contain control characters, U+FFFE or U+FFFF',
  );
  const nfc = refused('A name must be in Unicode normalization form C (NFC)');
  const surrogate = refused('A name cannot contain a lone surrogate');

  it('accepts the base protocol', () => {
    expect(
      ProtocolSchemaV9.safeParse(withFinishStage(protocolWithNames({})))
        .success,
    ).toBe(true);
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
    const protocol = protocolWithNames({
      node: { name },
      edge: { duration: name },
      ego: { egoName: name },
    });
    expect(ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success).toBe(
      true,
    );
  });

  it.each([
    ['empty', '', { path: namePath, code: 'too_small' }],
    ['leading space', ' name', padded],
    ['trailing space', 'name ', padded],
    ['tab', 'first\tname', control],
    ['line break', 'first\nname', control],
    ['null character', 'name\u0000', control],
    ['decomposed accent', 'namé', nfc],
    ['noncharacter', 'name￿', control],
    ['lone surrogate', 'name\uD800', surrogate],
  ])('rejects a name with a %s', (_description, name, issue) => {
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(protocolWithNames({ node: { name } })),
    );
    expect(parseIssues(result)).toEqual([issue]);
  });

  it('still rejects two attributes of one entity with the same name', () => {
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(
        protocolWithNames({ node: { name: '名前', age: '名前' } }),
      ),
    );
    expect(parseIssues(result)).toEqual([
      {
        path: personVariables,
        code: 'custom',
        message: 'Duplicate attribute name "名前"',
      },
    ]);
  });

  it('refuses a variable id that is not a UUID', () => {
    const protocol = withFinishStage(protocolWithNames({}));
    const nodeTypes: Record<
      string,
      { variables: Record<string, unknown> } | undefined
    > = protocol.codebook.node;
    const person = nodeTypes[testTypeId('person')];
    if (person === undefined) throw new Error('expected the person type');
    person.variables['nombre completo'] = {
      name: 'Nombre completo',
      type: 'text',
    };

    const result = ProtocolSchemaV9.safeParse(protocol);

    expect(
      result.error?.issues.map(({ path, code, message }) => ({
        path: path.join('.'),
        code,
        message,
      })),
    ).toEqual([
      {
        path: `${personVariables}.nombre completo`,
        code: 'invalid_key',
        message:
          'The variable id "nombre completo" is not a UUID. Every variable id must be a UUID.',
      },
    ]);
  });
});

describe('Schema 8 attribute names', () => {
  it('migrates a version 8 document holding names only schema 9 accepts, and the result validates', () => {
    const original = asSchema8Protocol(
      protocolWithNames({
        node: { name: '名前' },
        edge: { duration: 'first name' },
        ego: { egoName: 'Age (years)' },
      }),
    );
    const result = migrateProtocol(original);
    expect(ProtocolSchemaV9.safeParse(withFinishStage(result)).success).toBe(
      true,
    );
    const migrated = withOriginalCodebookKeys(result, original);

    expect(migrated.schemaVersion).toBe(9);
    expect(migrated.codebook.node?.person?.variables?.name?.name).toBe('名前');
    expect(migrated.codebook.edge?.knows?.variables?.duration?.name).toBe(
      'first name',
    );
    expect(migrated.codebook.ego?.variables?.egoName?.name).toBe('Age (years)');
  });
});

const protocolWithPassphraseRules = (validation: {
  minLength?: number;
  maxLength?: number;
}) => {
  const base = createBaseProtocol();
  return withFinishStage({
    ...base,
    stages: [
      ...base.stages,
      {
        id: 'anonymisation',
        type: 'Anonymisation',
        label: localized('Anonymisation'),
        explanationText: localized('# Privacy\n\nChoose a passphrase.'),
        validation,
      },
    ],
  });
};

describe('Schema 9 passphrase length rules', () => {
  it.each([
    { minLength: 4, maxLength: 12 },
    { minLength: 6, maxLength: 6 },
    { maxLength: 6 },
    { minLength: 10 },
  ])('accepts %j', (validation) => {
    expect(
      ProtocolSchemaV9.safeParse(protocolWithPassphraseRules(validation))
        .success,
    ).toBe(true);
  });

  it('refuses a minimum longer than the maximum, at the minimum', () => {
    const protocol = protocolWithPassphraseRules({
      minLength: 9,
      maxLength: 6,
    });
    const stageIndex = protocol.stages.findIndex(
      ({ type }) => type === 'Anonymisation',
    );

    expect(parseIssues(ProtocolSchemaV9.safeParse(protocol))).toEqual([
      {
        path: `stages.${stageIndex}.validation.minLength`,
        code: 'custom',
        message:
          'The minimum passphrase length (9) is longer than the maximum (6), so no participant could choose a passphrase.',
      },
    ]);
  });

  it('leaves schema 8 accepting it, so the migration can repair it', () => {
    expect(
      ProtocolSchemaV8.safeParse(
        asSchema8Protocol(
          protocolWithPassphraseRules({ minLength: 9, maxLength: 6 }),
        ),
      ).success,
    ).toBe(true);
  });
});
