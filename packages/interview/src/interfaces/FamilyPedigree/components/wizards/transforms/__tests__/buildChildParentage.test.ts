import { describe, expect, it } from 'vitest';

import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import { buildChildParentage } from '../buildChildParentage';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipTypeVariable: 'relationship',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGC',
};

describe('buildChildParentage', () => {
  it('emits biological edges from two existing parents, plus a carrier edge when the egg parent carried', () => {
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
    expect(edges).toHaveLength(3);

    const egoEdges = edges.filter((e) => e.source === 'ego-1');
    expect(egoEdges).toHaveLength(2);
    expect(
      egoEdges.some(
        (e) =>
          e.data.attributes.relationship === 'biological' &&
          e.data.attributes.isGC === undefined,
      ),
    ).toBe(true);
    expect(egoEdges.some((e) => e.data.attributes.isGC === true)).toBe(true);

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
    // ego gets a biological edge plus a gestational-carrier edge => 3 total with sperm
    expect(edges).toHaveLength(3);
    const egoEdges = edges.filter((e) => e.source === 'ego-1');
    expect(egoEdges.some((e) => e.data.attributes.isGC === true)).toBe(true);
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
  });
});
