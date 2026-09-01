import { describe, expect, it } from 'vitest';

import type { VariableConfig } from '../../../../store';
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
  gameteRoleVariable: 'gameteRole',
  biologicalSexVariable: 'biologicalSex',
};

describe('buildChildParentage', () => {
  it('writes dangerous configured node and edge variables as own attributes', () => {
    const prototypeDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      '__proto__',
    );
    const dangerousConfig: VariableConfig = {
      ...variableConfig,
      biologicalSexVariable: '__proto__',
      gameteRoleVariable: 'constructor',
      isGestationalCarrierVariable: 'prototype',
    };
    const { edges, nodes } = buildChildParentage(
      'child',
      {
        'egg-parent-carried': true,
        'egg-source': 'new',
        'new-egg-source': { biologicalSex: 'female', name: 'Parent' },
      },
      dangerousConfig,
    );
    const nodeAttributes = nodes[0]?.data.attributes;
    const edgeAttributes = edges[0]?.data.attributes;

    expect(Object.hasOwn(nodeAttributes ?? {}, '__proto__')).toBe(true);
    expect(nodeAttributes?.['__proto__']).toEqual(['female']);
    expect(Object.hasOwn(edgeAttributes ?? {}, 'prototype')).toBe(true);
    expect(edgeAttributes?.prototype).toBe(true);
    expect(Object.hasOwn(edgeAttributes ?? {}, 'constructor')).toBe(true);
    expect(edgeAttributes?.constructor).toEqual(['egg']);
    expect(
      Object.getOwnPropertyDescriptor(Object.prototype, '__proto__'),
    ).toEqual(prototypeDescriptor);
  });

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
    expect(egoEdges[0]?.data.attributes.relationship).toEqual(['biological']);
    expect(egoEdges[0]?.data.attributes.isGC).toBe(true);
    expect(
      egoEdges[0]?.data.attributes[variableConfig.gameteRoleVariable],
    ).toEqual(['egg']);

    const spermEdge = edges.find((e) => e.source === 'partner-1');
    expect(spermEdge?.data.attributes.relationship).toEqual(['biological']);
    expect(parents.map((p) => p.roleKey)).toContain('egg-source');
  });

  it('creates a donor node and donor edge for a new sperm donor', () => {
    const { nodes, edges } = buildChildParentage(
      'child',
      {
        'egg-source': 'ego-1',
        'sperm-source': 'new',
        'new-sperm-source': {
          name: 'Donor Dan',
          biologicalSex: 'female',
        },
        'sperm-source-is-donor': true,
        'egg-parent-carried': true,
      },
      variableConfig,
    );

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      tempId: 'new-sperm-source',
      data: {
        attributes: {
          name: 'Donor Dan',
          isEgo: false,
          biologicalSex: ['female'],
        },
      },
    });
    const donorEdge = edges.find((e) => e.source === 'new-sperm-source');
    expect(donorEdge?.data.attributes.relationship).toEqual(['donor']);
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
      relationship: ['surrogate'],
      isGC: true,
    });
    expect(
      surrogateEdge?.data.attributes[variableConfig.gameteRoleVariable],
    ).toBeUndefined();
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
    expect(eggEdge?.data.attributes[variableConfig.gameteRoleVariable]).toEqual(
      ['egg'],
    );

    const spermEdge = edges.find((e) => e.source === 'partner-1');
    expect(
      spermEdge?.data.attributes[variableConfig.gameteRoleVariable],
    ).toEqual(['sperm']);
  });
});
