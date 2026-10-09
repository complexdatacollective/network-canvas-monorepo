import { describe, expect, it } from 'vitest';

import { localized } from '../../../utils/test-utils.ts';
import {
  EdgeDefinitionSchema,
  NodeDefinitionSchema,
} from '../codebook/definitions.ts';
import { categoricalOptionValueSchema } from '../variables/variable.ts';

// A name a researcher types — a node or edge type's name, an option's value —
// becomes part of an export (a file name, a column), so each is held to
// `CodebookNameSchema`: any script, but not empty, padded, non-NFC, or
// carrying characters an export cannot write.
const INVALID_NAMES = [
  ['empty', ''],
  ['padded', ' Person '],
  ['not NFC', 'Café'],
  ['a control character', 'Per\u0007son'],
  ['a line break', 'Per\nson'],
] as const;

const nodeType = (name: string) => ({
  name,
  label: localized('Person'),
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
});

const edgeType = (name: string) => ({ name, label: localized('Knows') });

const nameIssuePaths = (
  schema: typeof NodeDefinitionSchema | typeof EdgeDefinitionSchema,
  value: unknown,
) => schema.safeParse(value).error?.issues.map(({ path }) => path) ?? [];

describe.each([
  ['a node type', NodeDefinitionSchema, nodeType],
  ['an edge type', EdgeDefinitionSchema, edgeType],
] as const)('%s name', (_entity, schema, entity) => {
  it('accepts a name in any script, with spaces', () => {
    expect(schema.safeParse(entity('Personne âgée')).success).toBe(true);
    expect(schema.safeParse(entity('人')).success).toBe(true);
  });

  it.each(INVALID_NAMES)('rejects a name that is %s', (_n, name) => {
    expect(nameIssuePaths(schema, entity(name))).toContainEqual(['name']);
  });
});

describe('an option value', () => {
  it('accepts an integer or a name', () => {
    expect(categoricalOptionValueSchema.safeParse(3).success).toBe(true);
    expect(categoricalOptionValueSchema.safeParse('Rouge vif').success).toBe(
      true,
    );
  });

  it.each(INVALID_NAMES)('rejects a text value that is %s', (_n, value) => {
    expect(categoricalOptionValueSchema.safeParse(value).success).toBe(false);
  });
});
