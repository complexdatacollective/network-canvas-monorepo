import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { getGroupKeys } from '../groupMembership';

function makeNode(attributes: Record<string, VariableValue> = {}): NcNode {
  return {
    [entityPrimaryKeyProperty]: 'node-1',
    [entityAttributesProperty]: attributes,
    type: 'person',
    promptIDs: [],
    stageId: '',
  };
}

describe('getGroupKeys', () => {
  it('returns all string/number entries from an array value', () => {
    expect(getGroupKeys(makeNode({ group: ['a', 'b', 1] }), 'group')).toEqual([
      'a',
      'b',
      1,
    ]);
  });

  it('returns a single-element array for a scalar string value', () => {
    expect(getGroupKeys(makeNode({ group: 'red' }), 'group')).toEqual(['red']);
  });

  it('returns a single-element array for a scalar number value', () => {
    expect(getGroupKeys(makeNode({ group: 7 }), 'group')).toEqual([7]);
  });

  it('returns an empty array when the attribute is null', () => {
    expect(getGroupKeys(makeNode({ group: null }), 'group')).toEqual([]);
  });

  it('returns an empty array when the attribute is missing entirely', () => {
    // A read of an absent key yields undefined at runtime; this is the same
    // raw == null path the function guards, so it doubles as the undefined case.
    expect(getGroupKeys(makeNode({ other: 1 }), 'group')).toEqual([]);
  });

  it('filters out booleans from a mixed array', () => {
    expect(
      getGroupKeys(makeNode({ group: ['a', true, 2, false] }), 'group'),
    ).toEqual(['a', 2]);
  });

  it('returns an empty array for an empty array value', () => {
    expect(getGroupKeys(makeNode({ group: [] }), 'group')).toEqual([]);
  });
});
