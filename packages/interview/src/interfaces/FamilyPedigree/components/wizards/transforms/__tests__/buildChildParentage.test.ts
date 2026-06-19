import { describe, expect, it } from 'vitest';

import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import { buildChildParentage } from '../buildChildParentage';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'relationship',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGC',
};

describe('buildChildParentage', () => {
  it('emits one edge per existing parent, flagging the egg parent as carrier when they carried', () => {
    const { nodes, edges, parents } = buildChildParentage(
      'child',
      {
        'egg-source': 'ego-1',
        'sperm-source': 'partner-1',
        'egg-parent-carried': true,
      },
      variableConfig,
    );

    expect(nodes).toHaveLength(0);
    // One edge per parent: the egg parent who also carried gets a single edge
    // flagged as gestational carrier, not a duplicate carrier edge.
    expect(edges).toHaveLength(2);

    const egoEdges = edges.filter((e) => e.source === 'ego-1');
    expect(egoEdges).toHaveLength(1);
    expect(egoEdges[0]?.data.attributes.relationship).toBe('biological');
    expect(egoEdges[0]?.data.attributes.isGC).toBe(true);
    expect(egoEdges[0]?.gameteRole).toBe('egg');

    const spermEdge = edges.find((e) => e.source === 'partner-1');
    expect(spermEdge?.data.attributes.relationship).toBe('biological');
    expect(parents.map((p) => p.roleKey)).toContain('egg-source');
  });

  it('creates a donor node and donor edge for a new sperm donor', () => {
    const { nodes, edges } = buildChildParentage(
      'child',
      {
        'egg-source': 'ego-1',
        'sperm-source': 'new',
        'new-sperm-source': { name: 'Donor Dan' },
        'sperm-source-is-donor': true,
        'egg-parent-carried': true,
      },
      variableConfig,
    );

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      tempId: 'new-sperm-source',
      data: { attributes: { name: 'Donor Dan', isEgo: false } },
    });
    const donorEdge = edges.find((e) => e.source === 'new-sperm-source');
    expect(donorEdge?.data.attributes.relationship).toBe('donor');
  });

  it('treats a missing egg-parent-carried value as carried (default)', () => {
    const { edges } = buildChildParentage(
      'child',
      { 'egg-source': 'ego-1', 'sperm-source': 'partner-1' },
      variableConfig,
    );
    // One edge per parent; the egg parent's edge is flagged as carrier.
    expect(edges).toHaveLength(2);
    const egoEdges = edges.filter((e) => e.source === 'ego-1');
    expect(egoEdges).toHaveLength(1);
    expect(egoEdges[0]?.data.attributes.isGC).toBe(true);
  });

  it('records a separate gestational carrier as a surrogate', () => {
    const { nodes, edges } = buildChildParentage(
      'child',
      {
        'egg-source': 'ego-1',
        'sperm-source': 'partner-1',
        'egg-parent-carried': false,
        'carrier-source': 'new',
        'new-carrier': { name: 'Surrogate Sue' },
      },
      variableConfig,
    );

    const surrogateNode = nodes.find((n) => n.tempId === 'new-carrier');
    expect(surrogateNode?.data.attributes.name).toBe('Surrogate Sue');
    const surrogateEdge = edges.find((e) => e.source === 'new-carrier');
    expect(surrogateEdge?.data.attributes).toMatchObject({
      relationship: 'surrogate',
      isGC: true,
    });
    expect(surrogateEdge?.gameteRole).toBeUndefined();
  });

  it('tags the egg and sperm parent edges with the gamete role', () => {
    const { edges } = buildChildParentage(
      'child',
      {
        'egg-source': 'ego-1',
        'sperm-source': 'partner-1',
        'egg-parent-carried': true,
      },
      variableConfig,
    );

    const eggEdge = edges.find((e) => e.source === 'ego-1');
    expect(eggEdge?.gameteRole).toBe('egg');

    const spermEdge = edges.find((e) => e.source === 'partner-1');
    expect(spermEdge?.gameteRole).toBe('sperm');
  });
});
