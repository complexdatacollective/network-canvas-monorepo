import { describe, expect, it } from 'vitest';

import type { VariableValue } from '@codaco/shared-consts';

import { withInferredBiologicalSex } from '../deriveBiologicalSex';
import type { CommitBatch, VariableConfig } from '../store';

const config: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'relationship',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGC',
  gameteRoleVariable: 'gameteRole',
  biologicalSexVariable: 'biologicalSex',
};

const parentEdge = (
  source: string,
  relType: string,
  extra: Record<string, VariableValue> = {},
) => ({
  source,
  target: 'child',
  data: { attributes: { relationship: [relType], ...extra } },
});

function build(
  nodes: [string, Record<string, VariableValue>][],
  edges: CommitBatch['edges'],
): CommitBatch {
  return {
    nodes: nodes.map(([tempId, attributes]) => ({
      tempId,
      data: { attributes },
    })),
    edges,
  };
}

const sexOf = (batch: CommitBatch, tempId: string) =>
  batch.nodes.find((n) => n.tempId === tempId)?.data.attributes.biologicalSex;

describe('withInferredBiologicalSex', () => {
  it('infers sex from reproductive role and populates every node', () => {
    const result = withInferredBiologicalSex(
      build(
        [
          ['egg', {}],
          ['sperm', {}],
          ['surrogate', {}],
          ['child', {}],
          ['lonely', {}],
        ],
        [
          parentEdge('egg', 'biological', { gameteRole: 'egg' }),
          parentEdge('sperm', 'biological', { gameteRole: 'sperm' }),
          parentEdge('surrogate', 'surrogate', { isGC: true }),
        ],
      ),
      config,
    );

    // biologicalSex is categorical, stored as a single-element array.
    expect(sexOf(result, 'egg')).toEqual(['female']);
    expect(sexOf(result, 'sperm')).toEqual(['male']);
    expect(sexOf(result, 'surrogate')).toEqual(['female']);
    // A leaf with no reproductive role and no captured sex is still populated.
    expect(sexOf(result, 'child')).toEqual(['unknown']);
    expect(sexOf(result, 'lonely')).toEqual(['unknown']);
    // The invariant: no node is left without the attribute.
    for (const node of result.nodes) {
      expect(node.data.attributes.biologicalSex).toBeDefined();
    }
  });

  it('keeps a captured (asked) sex rather than overriding it from role', () => {
    const result = withInferredBiologicalSex(
      build(
        [['person', { biologicalSex: ['male'] }]],
        [parentEdge('person', 'biological', { gameteRole: ['egg'] })],
      ),
      config,
    );
    // Captured 'male' wins over the egg-role inference of 'female'.
    expect(sexOf(result, 'person')).toEqual(['male']);
  });
});
