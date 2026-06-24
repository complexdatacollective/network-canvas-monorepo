import { describe, expect, it } from 'vitest';

import type { NcEdge } from '@codaco/shared-consts';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

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
};

describe('AddParentWizard transformToCommitBatch', () => {
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
