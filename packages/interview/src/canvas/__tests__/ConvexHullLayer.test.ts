import { describe, expect, it } from 'vitest';

import type { VariableOption } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { testId, testTypeId, testVariableId } from '../../__tests__/testIds';
import { groupNodesByVariable } from '../ConvexHullLayer';

const COLOR = testVariableId('color');
const SIZE = testVariableId('size');
const SHAPE = testVariableId('shape');

function makeNode(
  id: string,
  attributes: Record<string, VariableValue> = {},
): NcNode {
  return {
    [entityPrimaryKeyProperty]: id,
    [entityAttributesProperty]: attributes,
    type: testTypeId('person'),
    promptIDs: [],
    stageId: '',
  };
}

const OPTIONS: VariableOption[] = [
  {
    id: testId('ConvexHullLayer option 1'),
    value: 'red',
    label: { en: 'Red' },
  },
  {
    id: testId('ConvexHullLayer option 2'),
    value: 'blue',
    label: { en: 'Blue' },
  },
  {
    id: testId('ConvexHullLayer option 3'),
    value: 'green',
    label: { en: 'Green' },
  },
];

describe('groupNodesByVariable', () => {
  it('returns an empty map when given an empty nodes array', () => {
    const result = groupNodesByVariable([], COLOR, OPTIONS);
    expect(result.size).toBe(0);
  });

  it('correctly groups nodes by a single string value', () => {
    const nodes = [
      makeNode('node-1', { [COLOR]: 'red' }),
      makeNode('node-2', { [COLOR]: 'red' }),
      makeNode('node-3', { [COLOR]: 'blue' }),
    ];

    const result = groupNodesByVariable(nodes, COLOR, OPTIONS);

    expect(result.size).toBe(2);

    const groupRed = result.get('red');
    expect(groupRed).toBeDefined();
    expect(groupRed!.nodeIds).toContain('node-1');
    expect(groupRed!.nodeIds).toContain('node-2');
    expect(groupRed!.nodeIds).toHaveLength(2);

    const groupBlue = result.get('blue');
    expect(groupBlue).toBeDefined();
    expect(groupBlue!.nodeIds).toContain('node-3');
    expect(groupBlue!.nodeIds).toHaveLength(1);
  });

  it('places a node with an array of values into multiple groups', () => {
    const nodes = [makeNode('node-multi', { [COLOR]: ['red', 'blue'] })];

    const result = groupNodesByVariable(nodes, COLOR, OPTIONS);

    expect(result.size).toBe(2);
    expect(result.get('red')!.nodeIds).toContain('node-multi');
    expect(result.get('blue')!.nodeIds).toContain('node-multi');
  });

  it('excludes nodes that do not have the group variable', () => {
    const nodes = [
      makeNode('node-with', { [COLOR]: 'red' }),
      makeNode('node-without', { [SIZE]: 10 }),
      makeNode('node-missing', { [SHAPE]: 'round' }),
    ];

    const result = groupNodesByVariable(nodes, COLOR, OPTIONS);

    expect(result.size).toBe(1);
    const group = result.get('red')!;
    expect(group.nodeIds).toContain('node-with');
    expect(group.nodeIds).not.toContain('node-without');
    expect(group.nodeIds).not.toContain('node-missing');
  });

  it('handles numeric scalar values', () => {
    const numericOptions: VariableOption[] = [
      {
        id: testId('ConvexHullLayer option 4'),
        value: 1,
        label: { en: 'One' },
      },
      {
        id: testId('ConvexHullLayer option 5'),
        value: 2,
        label: { en: 'Two' },
      },
    ];
    const nodes = [
      makeNode('node-1', { [COLOR]: 1 }),
      makeNode('node-2', { [COLOR]: 2 }),
    ];

    const result = groupNodesByVariable(nodes, COLOR, numericOptions);

    expect(result.size).toBe(2);
    expect(result.get(1)!.nodeIds).toContain('node-1');
    expect(result.get(2)!.nodeIds).toContain('node-2');
  });

  it('maps colorIndex as 1-based position from categoricalOptions', () => {
    const nodes = [
      makeNode('node-a', { [COLOR]: 'red' }),
      makeNode('node-b', { [COLOR]: 'blue' }),
      makeNode('node-c', { [COLOR]: 'green' }),
    ];

    const result = groupNodesByVariable(nodes, COLOR, OPTIONS);

    expect(result.get('red')!.colorIndex).toBe(1);
    expect(result.get('blue')!.colorIndex).toBe(2);
    expect(result.get('green')!.colorIndex).toBe(3);
  });

  it('assigns out-of-codebook values a distinct color after the known options', () => {
    // 'purple' is not one of OPTIONS [red, blue, green] (3 options).
    // It must NOT collide with the first option's color (index 1), and
    // should be allocated the next index after the known options.
    const nodes = [
      makeNode('node-known', { [COLOR]: 'red' }),
      makeNode('node-unknown', { [COLOR]: 'purple' }),
    ];

    const result = groupNodesByVariable(nodes, COLOR, OPTIONS);

    // Known option keeps its stable, 1-based position.
    expect(result.get('red')!.colorIndex).toBe(1);
    // Out-of-codebook value gets a distinct index after the 3 known options.
    expect(result.get('purple')!.colorIndex).toBe(4);
    expect(result.get('purple')!.colorIndex).not.toBe(
      result.get('red')!.colorIndex,
    );
  });

  it('gives multiple distinct out-of-codebook values distinct, deterministic colors', () => {
    const nodes = [
      makeNode('node-z', { [COLOR]: 'zeta' }),
      makeNode('node-a', { [COLOR]: 'alpha' }),
    ];

    const result = groupNodesByVariable(nodes, COLOR, OPTIONS);

    // 3 known options -> out-of-codebook indices start at 4, assigned in a
    // stable (sorted) order so they don't depend on node iteration order.
    expect(result.get('alpha')!.colorIndex).toBe(4);
    expect(result.get('zeta')!.colorIndex).toBe(5);
    expect(result.get('alpha')!.colorIndex).not.toBe(
      result.get('zeta')!.colorIndex,
    );
  });

  it('handles array of numeric values (from CheckboxGroup forms)', () => {
    const numericOptions: VariableOption[] = [
      {
        id: testId('ConvexHullLayer option 6'),
        value: 1,
        label: { en: 'One' },
      },
      {
        id: testId('ConvexHullLayer option 7'),
        value: 2,
        label: { en: 'Two' },
      },
      {
        id: testId('ConvexHullLayer option 8'),
        value: 3,
        label: { en: 'Three' },
      },
    ];
    const nodes = [
      makeNode('node-a', { [COLOR]: [1] }),
      makeNode('node-b', { [COLOR]: [1, 2] }),
      makeNode('node-c', { [COLOR]: [3] }),
    ];

    const result = groupNodesByVariable(nodes, COLOR, numericOptions);

    expect(result.size).toBe(3);
    expect(result.get(1)!.nodeIds).toEqual(['node-a', 'node-b']);
    expect(result.get(2)!.nodeIds).toEqual(['node-b']);
    expect(result.get(3)!.nodeIds).toEqual(['node-c']);
  });

  it('handles array of string values (from CheckboxGroup forms)', () => {
    const nodes = [
      makeNode('node-a', { [COLOR]: ['red', 'blue'] }),
      makeNode('node-b', { [COLOR]: ['blue'] }),
    ];

    const result = groupNodesByVariable(nodes, COLOR, OPTIONS);

    expect(result.size).toBe(2);
    expect(result.get('red')!.nodeIds).toEqual(['node-a']);
    expect(result.get('blue')!.nodeIds).toEqual(['node-a', 'node-b']);
  });

  it('handles nodes where the group variable is an empty array', () => {
    const nodes = [makeNode('node-empty', { [COLOR]: [] })];

    const result = groupNodesByVariable(nodes, COLOR, OPTIONS);

    expect(result.size).toBe(0);
  });
});
