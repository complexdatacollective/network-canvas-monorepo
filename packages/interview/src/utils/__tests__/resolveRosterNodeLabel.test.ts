import { describe, expect, it } from 'vitest';

import type { NodeDefinition } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { resolveRosterNodeLabel } from '../resolveRosterNodeLabel';

const NAME_UUID = 'aaaa-1111';
const AGE_UUID = 'bbbb-2222';

const codebookVariables: NodeDefinition['variables'] = {
  [NAME_UUID]: { name: 'name', type: 'text' },
  [AGE_UUID]: { name: 'age', type: 'number' },
};

const makeNode = (attributes: NcNode['attributes']): NcNode => ({
  [entityPrimaryKeyProperty]: 'hash-deadbeef',
  type: 'person',
  [entityAttributesProperty]: attributes,
});

describe('resolveRosterNodeLabel', () => {
  it('returns the value of the name-heuristic attribute when one resolves', () => {
    const label = resolveRosterNodeLabel({
      codebookVariables,
      node: makeNode({ [NAME_UUID]: 'Alice Smith', [AGE_UUID]: 30 }),
      subjectLabel: 'Person',
      sequentialNumber: 1,
    });

    expect(label).toBe('Alice Smith');
  });

  it('falls back to the first usable value when the heuristic finds nothing (UUID mismatch)', () => {
    // Attribute keys are UUIDs that are NOT in the codebook — as happens with a
    // roster exported from a preview interview built against a different
    // protocol. The heuristic returns null, so we surface the first value.
    const label = resolveRosterNodeLabel({
      codebookVariables,
      node: makeNode({ 'zzzz-9999': 'Alice Smith', 'yyyy-8888': 30 }),
      subjectLabel: 'Person',
      sequentialNumber: 4,
    });

    expect(label).toBe('Alice Smith');
  });

  it('skips empty and non-stringable values and picks the first string or number', () => {
    const label = resolveRosterNodeLabel({
      codebookVariables,
      node: makeNode({ a: '', b: true, c: 42 }),
      subjectLabel: 'Person',
      sequentialNumber: 2,
    });

    expect(label).toBe('42');
  });

  it('returns the "Unnamed {subject} {n}" placeholder for a value-less node', () => {
    const label = resolveRosterNodeLabel({
      codebookVariables,
      node: makeNode({ a: '', b: '' }),
      subjectLabel: 'Person',
      sequentialNumber: 3,
    });

    expect(label).toBe('Unnamed Person 3');
  });
});
