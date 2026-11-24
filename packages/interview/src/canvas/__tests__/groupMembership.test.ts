import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { testTypeId, testVariableId } from '../../__tests__/testIds';
import { getGroupKeys } from '../groupMembership';

const GROUP = testVariableId('group');

function makeNode(attributes: Record<string, VariableValue> = {}): NcNode {
  return {
    [entityPrimaryKeyProperty]: 'node-1',
    [entityAttributesProperty]: attributes,
    type: testTypeId('person'),
    promptIDs: [],
    stageId: '',
  };
}

describe('getGroupKeys', () => {
  it('returns all string/number entries from an array value', () => {
    expect(getGroupKeys(makeNode({ [GROUP]: ['a', 'b', 1] }), GROUP)).toEqual([
      'a',
      'b',
      1,
    ]);
  });

  it('returns a single-element array for a scalar string value', () => {
    expect(getGroupKeys(makeNode({ [GROUP]: 'red' }), GROUP)).toEqual(['red']);
  });

  it('returns a single-element array for a scalar number value', () => {
    expect(getGroupKeys(makeNode({ [GROUP]: 7 }), GROUP)).toEqual([7]);
  });

  it('returns an empty array when the attribute is missing entirely', () => {
    expect(
      getGroupKeys(makeNode({ [testVariableId('other')]: 1 }), GROUP),
    ).toEqual([]);
  });

  it('filters out booleans from a mixed array', () => {
    expect(
      getGroupKeys(makeNode({ [GROUP]: ['a', true, 2, false] }), GROUP),
    ).toEqual(['a', 2]);
  });

  it('returns an empty array for an empty array value', () => {
    expect(getGroupKeys(makeNode({ [GROUP]: [] }), GROUP)).toEqual([]);
  });
});
