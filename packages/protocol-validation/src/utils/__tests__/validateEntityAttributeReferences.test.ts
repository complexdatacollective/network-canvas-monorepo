import { describe, expect, it } from 'vitest';

import type { Codebook } from '../../schemas/8/schema';
import { validateReferences } from '../validateEntityAttributeReferences';

// Minimal fixture: Variable discriminated-union requires many optional fields
// (e.g. ordinal requires `options`); building a fully-valid Codebook inline is
// impractical so we cast through unknown once at the boundary.
const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        age: { name: 'age', type: 'number' },
        rank: { name: 'rank', type: 'ordinal' },
      },
    },
  },
} as unknown as Codebook;

describe('validateReferences', () => {
  it('reports a reference to a non-existent variable', () => {
    const issues = validateReferences(codebook, [
      {
        path: ['stages', 0, 'prompts', 0, 'variable'],
        variableId: 'MISSING',
        subject: { entity: 'node', type: 'person' },
      },
    ]);
    expect(issues).toEqual([
      {
        code: 'custom',
        message: 'The variable "MISSING" does not exist in the codebook',
        path: ['stages', 0, 'prompts', 0, 'variable'],
      },
    ]);
  });

  it('reports a type-invalid reference when requireType excludes the variable type', () => {
    const issues = validateReferences(codebook, [
      {
        path: ['p'],
        variableId: 'age',
        subject: { entity: 'node', type: 'person' },
        requireType: ['ordinal'],
      },
    ]);
    expect(issues.some((i) => i.message.includes('ordinal'))).toBe(true);
  });

  it('accepts a present, type-valid reference', () => {
    const issues = validateReferences(codebook, [
      {
        path: ['p'],
        variableId: 'rank',
        subject: { entity: 'node', type: 'person' },
        requireType: ['ordinal'],
      },
    ]);
    expect(issues).toEqual([]);
  });

  it('skips hits with no resolved subject', () => {
    const issues = validateReferences(codebook, [
      { path: ['f'], variableId: 'whatever', subject: undefined },
    ]);
    expect(issues).toEqual([]);
  });
});
