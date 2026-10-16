import { describe, expect, it } from 'vitest';

import type { NodeDefinition } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { resolveRosterNodeLabel } from '../resolveRosterNodeLabel';

const placeholder = (sequentialNumber: number) => `Unnamed ${sequentialNumber}`;

const makeNode = (
  attributes: NcNode[typeof entityAttributesProperty],
): NcNode => ({
  type: 'person',
  [entityPrimaryKeyProperty]: 'a1b2c3d4-content-hash-uid',
  [entityAttributesProperty]: attributes,
});

describe('resolveRosterNodeLabel', () => {
  it('returns the value found by the name heuristic when one matches', () => {
    const codebookVariables: NodeDefinition['variables'] = {
      'var-name': { name: 'name', type: 'text' },
      'var-age': { name: 'age', type: 'number' },
    };

    const node = makeNode({ 'var-name': 'John Doe', 'var-age': 30 });

    const result = resolveRosterNodeLabel({
      codebookVariables,
      node,
      placeholder,
      sequentialNumber: 1,
    });

    expect(result).toBe('John Doe');
  });

  it('falls back to the first non-empty string/number value when the heuristic returns null (UUID mismatch)', () => {
    // Codebook defines a "name" variable, but the roster node's attributes are
    // keyed by UUIDs that are NOT present in the codebook (e.g. a preview-export
    // roster), so the heuristic finds nothing.
    const codebookVariables: NodeDefinition['variables'] = {
      'codebook-name-uuid': {
        name: 'name',
        type: 'text',
      },
    };

    const node = makeNode({
      'mismatched-uuid-1': 'Alice Smith',
      'mismatched-uuid-2': 30,
    });

    const result = resolveRosterNodeLabel({
      codebookVariables,
      node,
      placeholder,
      sequentialNumber: 2,
    });

    expect(result).toBe('Alice Smith');
  });

  it('skips empty and non-primitive values when choosing the first value', () => {
    const node = makeNode({
      'empty': '',
      'object-value': { x: 1, y: 2 },
      'first-real': 42,
    });

    const result = resolveRosterNodeLabel({
      codebookVariables: undefined,
      node,
      placeholder,
      sequentialNumber: 3,
    });

    expect(result).toBe('42');
  });

  it('returns the numbered placeholder for a value-less node', () => {
    const node = makeNode({});

    const result = resolveRosterNodeLabel({
      codebookVariables: {
        'codebook-name-uuid': {
          name: 'name',
          type: 'text',
        },
      },
      node,
      placeholder,
      sequentialNumber: 3,
    });

    expect(result).toBe('Unnamed 3');
  });
});
