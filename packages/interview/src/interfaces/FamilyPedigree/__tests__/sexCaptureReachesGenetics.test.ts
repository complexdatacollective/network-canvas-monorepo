import { describe, expect, it } from 'vitest';

import type { NcEdge, NcNode } from '@codaco/shared-consts';
import { resolveSex } from '~/interfaces/NarrativePedigree/genetics/resolveSex';

import { childCellTransform } from '../components/wizards/transforms/childCellTransform';
import { egoCellTransform } from '../components/wizards/transforms/egoCellTransform';
import { withInferredBiologicalSex } from '../deriveBiologicalSex';
import type { CommitBatch, VariableConfig } from '../store';

// A seam test: the FamilyPedigree wizard transforms feed the NarrativePedigree
// genetics engine. Unit-testing either side in isolation missed real bugs (ego's
// sex was never captured; an added child's sex was collected then dropped), so
// this asserts the whole path — form values -> transform -> network -> resolveSex
// -> a usable sex. Each case below FAILS on the corresponding regression.

const variableConfig: VariableConfig = {
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

const sexConfig = {
  biologicalSexVariable: variableConfig.biologicalSexVariable,
  gameteRoleVariable: variableConfig.gameteRoleVariable,
  relationshipTypeVariable: variableConfig.relationshipTypeVariable,
};

// Convert a commit batch into the NcNode[]/NcEdge[] the genetics engine reads,
// keyed by the transform's temp ids.
function toNetwork(rawBatch: CommitBatch): {
  nodes: NcNode[];
  edges: NcEdge[];
} {
  // Mirror the store's commit path, which fills biological sex on every node.
  const batch = withInferredBiologicalSex(rawBatch, variableConfig);
  const nodes = batch.nodes.map((n) => ({
    _uid: n.tempId,
    type: variableConfig.nodeType,
    attributes: n.data.attributes,
  })) as NcNode[];
  const edges = batch.edges.map((e, i) => ({
    _uid: `edge-${String(i)}`,
    type: variableConfig.edgeType,
    from: e.source,
    to: e.target,
    attributes: e.data.attributes,
  })) as NcEdge[];
  return { nodes, edges };
}

describe('biological sex captured in the wizard reaches the genetics engine', () => {
  it("resolves ego's sex from the value the participant entered (not 'unknown')", () => {
    const { batch } = egoCellTransform(
      {
        'biologicalSex': 'female',
        'egg-parent': { name: 'Mum' },
        'sperm-parent': { name: 'Dad' },
        'hasOtherParents': false,
      },
      variableConfig,
    );

    const { nodes, edges } = toNetwork(batch);
    // Ego is a leaf/proband with no outgoing gameteRole edge, so this is only
    // 'female' if the sex was actually captured and persisted onto the node.
    expect(resolveSex('ego', nodes, edges, sexConfig)).toBe('female');
  });

  it('keeps a canvas-added child’s sex through to the engine', () => {
    const batch = childCellTransform(
      {
        'child': { name: 'Kid', biologicalSex: 'male' },
        'egg-source': 'ego',
        'sperm-source': 'partner',
        'egg-parent-carried': true,
      },
      'ego',
      new Map(),
      new Map(),
      variableConfig,
    );

    const { nodes, edges } = toNetwork(batch);
    expect(resolveSex('child', nodes, edges, sexConfig)).toBe('male');
  });

  it('populates and resolves gamete parents from their role, and leaves no node without a sex', () => {
    const { batch } = egoCellTransform(
      {
        'biologicalSex': 'female',
        'egg-parent': { name: 'Mum' },
        'sperm-parent': { name: 'Dad' },
        'hasOtherParents': false,
      },
      variableConfig,
    );

    const { nodes, edges } = toNetwork(batch);
    // Gamete parents are never asked their sex; it is inferred from their role.
    expect(resolveSex('egg-parent', nodes, edges, sexConfig)).toBe('female');
    expect(resolveSex('sperm-parent', nodes, edges, sexConfig)).toBe('male');
    // Every node carries a stored biological-sex value.
    for (const node of nodes) {
      expect(
        node.attributes[variableConfig.biologicalSexVariable],
      ).toBeDefined();
    }
  });
});
