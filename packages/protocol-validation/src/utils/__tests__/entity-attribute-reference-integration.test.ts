import { describe, expect, it } from 'vitest';

// Minimal protocol fixture exercising codebook validation cross-references.
// The `Protocol<8>` type is structurally complex (all stages are discriminated-
// union variants with many required fields). Casting through `unknown` once at
// the fixture boundary avoids verbose inline construction while keeping the
// actual data shape correct for the paths under test.
import type { Protocol } from '../../schemas/index.ts';
import { collectEntityAttributeReferences } from '../collectEntityAttributeReferences.ts';
import { validateEntityAttributeReferences } from '../validateEntityAttributeReferences.ts';

const protocol = {
  schemaVersion: 8,
  name: 'p',
  stages: [],
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: {
          age: { name: 'age', type: 'number' },
          end: {
            name: 'end',
            type: 'datetime',
            validation: { greaterThanOrEqualToVariable: 'start' },
          },
          start: { name: 'start', type: 'datetime' },
        },
      },
    },
  },
} as unknown as Protocol<8>;

describe('entity-attribute references against the real v8 schema', () => {
  it('extracts a validation cross-reference with the owning-variable subject', () => {
    const hits = collectEntityAttributeReferences(protocol);
    const ref = hits.find((h) => h.variableId === 'start');
    expect(ref).toEqual({
      path: [
        'codebook',
        'node',
        'person',
        'variables',
        'end',
        'validation',
        'greaterThanOrEqualToVariable',
      ],
      variableId: 'start',
      subject: { entity: 'node', type: 'person' },
      requireType: ['number', 'datetime', 'scalar'],
    });
  });

  it('accepts a valid protocol and flags a removed referenced variable', () => {
    expect(validateEntityAttributeReferences(protocol)).toEqual([]);

    const broken = {
      ...protocol,
      codebook: {
        node: {
          person: {
            ...protocol.codebook.node?.person,
            variables: {
              age: protocol.codebook.node?.person?.variables?.age,
              end: protocol.codebook.node?.person?.variables?.end,
            },
          },
        },
      },
    } as unknown as Protocol<8>;

    const issues = validateEntityAttributeReferences(broken);
    expect(issues).toContainEqual({
      code: 'custom',
      message: 'The variable "start" does not exist in the codebook',
      path: [
        'codebook',
        'node',
        'person',
        'variables',
        'end',
        'validation',
        'greaterThanOrEqualToVariable',
      ],
    });
  });
});
