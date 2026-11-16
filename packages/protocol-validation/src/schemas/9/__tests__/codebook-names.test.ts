import { describe, expect, it } from 'vitest';

import { parseIssues } from '../../../__tests__/schemaIssues.ts';
import { localized } from '../../../utils/test-utils.ts';
import {
  EdgeDefinitionSchema,
  NodeDefinitionSchema,
} from '../codebook/definitions.ts';
import {
  categoricalOptionValueSchema,
  VariableSchema,
} from '../variables/variable.ts';

// A name a researcher types — a node or edge type's name, an option's value —
// becomes part of an export (a file name, a column), so each is held to
// `CodebookNameSchema`: any script, but not empty, padded, non-NFC, or
// carrying characters an export cannot write.
const empty = { code: 'too_small' };
const padded = {
  code: 'custom',
  message: 'A name cannot start or end with whitespace',
};
const nfc = {
  code: 'custom',
  message: 'A name must be in Unicode normalization form C (NFC)',
};
const control = {
  code: 'custom',
  message: 'A name cannot contain control characters, U+FFFE or U+FFFF',
};
const INVALID_NAMES = [
  ['empty', '', empty],
  ['only spaces', '   ', padded],
  ['padded', ' Person ', padded],
  ['not NFC', 'Café', nfc],
  ['a control character', 'Per\u0007son', control],
  ['a line break', 'Per\nson', control],
] as const;

const nodeType = (name: string) => ({
  name,
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
});

const edgeType = (name: string) => ({ name });

describe.each([
  ['a node type', NodeDefinitionSchema, nodeType],
  ['an edge type', EdgeDefinitionSchema, edgeType],
] as const)('%s name', (_entity, schema, entity) => {
  it('accepts a name in any script, with spaces', () => {
    expect(schema.safeParse(entity('Personne âgée')).success).toBe(true);
    expect(schema.safeParse(entity('人')).success).toBe(true);
  });

  it.each(INVALID_NAMES)('rejects a name that is %s', (_n, name, issue) => {
    expect(parseIssues(schema.safeParse(entity(name)))).toEqual([
      { path: 'name', ...issue },
    ]);
  });
});

describe('an attribute name', () => {
  it('accepts a name in any script, with spaces', () => {
    expect(
      VariableSchema.safeParse({ name: 'Âge du parent', type: 'text' }).success,
    ).toBe(true);
  });

  it.each(INVALID_NAMES)('rejects a name that is %s', (_n, name, issue) => {
    expect(
      parseIssues(VariableSchema.safeParse({ name, type: 'text' })),
    ).toEqual([{ path: 'name', ...issue }]);
  });
});

describe('an option value', () => {
  it('accepts an integer or a name', () => {
    expect(categoricalOptionValueSchema.safeParse(3).success).toBe(true);
    expect(categoricalOptionValueSchema.safeParse('Rouge vif').success).toBe(
      true,
    );
  });

  it.each(INVALID_NAMES)(
    'rejects a text value that is %s',
    (_n, value, issue) => {
      expect(
        parseIssues(categoricalOptionValueSchema.safeParse(value)),
      ).toEqual([{ path: '', ...issue }]);
    },
  );

  // What an option records cannot be known when its value is blank, so the
  // attribute is refused at that option rather than given a value.
  it.each([
    ['categorical', ''],
    ['categorical', ' '],
    ['ordinal', ''],
    ['ordinal', ' '],
  ] as const)('rejects a blank value of a %s attribute, %j', (type, value) => {
    const result = VariableSchema.safeParse({
      name: 'Closeness',
      type,
      options: [
        { label: localized('Close'), value: 'close' },
        { label: localized('Distant'), value },
      ],
    });
    expect(result.error?.issues.map(({ path }) => path)).toContainEqual([
      'options',
      1,
      'value',
    ]);
  });
});
