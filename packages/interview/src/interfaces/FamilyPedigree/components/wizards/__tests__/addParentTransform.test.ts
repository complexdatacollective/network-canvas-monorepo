import { describe, expect, it } from 'vitest';

import type { NcEdge } from '@codaco/shared-consts';

import type { VariableConfig } from '../../../store';
import { transformToCommitBatch } from '../AddParentWizard';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'rel',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGC',
  gameteRoleVariable: 'gameteRole',
  biologicalSexVariable: 'biologicalSex',
};

describe('AddParentWizard transformToCommitBatch', () => {
  it('writes a dangerous gestational-carrier variable as an own attribute', () => {
    const prototypeDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      '__proto__',
    );
    const batch = transformToCommitBatch(
      { 'edgeType': 'surrogate', 'parent-selection': 'uncle-1' },
      'child-1',
      new Map<string, NcEdge>(),
      { ...variableConfig, isGestationalCarrierVariable: '__proto__' },
    );
    const attributes = batch.edges[0]?.data.attributes;

    expect(Object.hasOwn(attributes ?? {}, '__proto__')).toBe(true);
    expect(attributes?.['__proto__']).toBe(true);
    expect(Object.getPrototypeOf(attributes)).toBe(Object.prototype);
    expect(
      Object.getOwnPropertyDescriptor(Object.prototype, '__proto__'),
    ).toEqual(prototypeDescriptor);
  });

  it('uses an existing selection as the parent without creating a node', () => {
    const batch = transformToCommitBatch(
      { 'parent-selection': 'uncle-1', 'edgeType': 'social' },
      'child-1',
      new Map<string, NcEdge>(),
      variableConfig,
    );
    expect(batch.nodes).toHaveLength(0);
    expect(batch.edges).toEqual([
      {
        source: 'uncle-1',
        target: 'child-1',
        data: { attributes: { rel: ['social'], isActive: true } },
      },
    ]);
  });

  it('creates a new node when selection is "new"', () => {
    const batch = transformToCommitBatch(
      {
        'parent-selection': 'new',
        'parent': { name: 'New Person' },
        'edgeType': 'social',
      },
      'child-1',
      new Map<string, NcEdge>(),
      variableConfig,
    );
    expect(batch.nodes).toHaveLength(1);
    expect(batch.nodes[0]?.data.attributes.name).toBe('New Person');
  });
});
