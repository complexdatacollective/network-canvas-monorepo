import { describe, expect, it } from 'vitest';

import type { NcEdge, NcNode, VariableValue } from '@codaco/shared-consts';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import { childCellTransform } from '../childCellTransform';

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

const relTypeOf = (e: {
  data: { attributes: Record<string, VariableValue> };
}): VariableValue => {
  const value = e.data.attributes[variableConfig.relationshipTypeVariable];
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
};

const egoId = 'ego-1';
const partnerId = 'partner-1';

function makeNodes(extras?: [string, NcNode][]): Map<string, NcNode> {
  const map = new Map<string, NcNode>([
    [
      egoId,
      {
        _uid: egoId,
        type: 'person',
        attributes: {
          name: 'Ego',
          [variableConfig.egoVariable]: true,
        },
      },
    ],
    [
      partnerId,
      {
        _uid: partnerId,
        type: 'person',
        attributes: {
          name: 'Partner',
          [variableConfig.egoVariable]: false,
        },
      },
    ],
  ]);
  if (extras) {
    for (const [id, data] of extras) {
      map.set(id, data);
    }
  }
  return map;
}

function makeEdges(extras?: [string, NcEdge][]): Map<string, NcEdge> {
  const map = new Map<string, NcEdge>([
    [
      'partner-edge',
      {
        _uid: 'partner-edge',
        type: 'family',
        from: egoId,
        to: partnerId,
        attributes: {
          [variableConfig.relationshipTypeVariable]: ['partner'],
          [variableConfig.isActiveVariable]: true,
        },
      },
    ],
  ]);
  if (extras) {
    for (const [id, data] of extras) {
      map.set(id, data);
    }
  }
  return map;
}

describe('childCellTransform', () => {
  it("records the child's own biological sex on the child node", () => {
    const values: Record<string, unknown> = {
      'child': { name: 'Baby', biologicalSex: 'male' },
      'egg-source': egoId,
      'sperm-source': partnerId,
      'egg-parent-carried': true,
    };

    const batch = childCellTransform(
      values,
      egoId,
      makeNodes(),
      makeEdges(),
      variableConfig,
    );

    expect(batch.nodes[0]).toMatchObject({
      tempId: 'child',
      data: { attributes: { name: 'Baby', biologicalSex: ['male'] } },
    });
  });

  it('creates child with both existing bio parents', () => {
    const values: Record<string, unknown> = {
      'child': { name: 'Baby' },
      'egg-source': egoId,
      'sperm-source': partnerId,
      'egg-parent-carried': true,
    };

    const batch = childCellTransform(
      values,
      egoId,
      makeNodes(),
      makeEdges(),
      variableConfig,
    );

    expect(batch.nodes).toHaveLength(1);
    expect(batch.nodes[0]).toMatchObject({
      tempId: 'child',
      data: {
        attributes: {
          name: 'Baby',
          [variableConfig.egoVariable]: false,
        },
      },
    });

    const parentEdges = batch.edges.filter(
      (e) => e.target === 'child' && relTypeOf(e) !== 'partner',
    );
    // One edge per parent: the egg parent who carried is flagged on their
    // single edge rather than getting a second carrier edge.
    expect(parentEdges).toHaveLength(2);

    const eggEdge = parentEdges.find((e) => e.source === egoId);
    expect(eggEdge?.data.attributes).toMatchObject({
      [variableConfig.relationshipTypeVariable]: ['biological'],
      [variableConfig.isActiveVariable]: true,
    });

    const spermEdge = parentEdges.find((e) => e.source === partnerId);
    expect(spermEdge?.data.attributes).toMatchObject({
      [variableConfig.relationshipTypeVariable]: ['biological'],
      [variableConfig.isActiveVariable]: true,
    });

    const gcEdge = parentEdges.find(
      (e) =>
        e.source === egoId &&
        relTypeOf(e) !== 'partner' &&
        e.data.attributes[variableConfig.isGestationalCarrierVariable] === true,
    );
    expect(gcEdge).toBeDefined();
  });

  it('creates child with donor parent', () => {
    const values: Record<string, unknown> = {
      'child': { name: 'Baby' },
      'egg-source': egoId,
      'sperm-source': 'new',
      'new-sperm-source': {
        name: 'Donor Dan',
      },
      'sperm-source-is-donor': true,
      'egg-parent-carried': true,
    };

    const batch = childCellTransform(
      values,
      egoId,
      makeNodes(),
      makeEdges(),
      variableConfig,
    );

    expect(batch.nodes).toHaveLength(2);
    expect(batch.nodes[0]).toMatchObject({ tempId: 'child' });
    expect(batch.nodes[1]).toMatchObject({
      tempId: 'new-sperm-source',
      data: {
        attributes: {
          name: 'Donor Dan',
          [variableConfig.egoVariable]: false,
        },
      },
    });

    const donorEdge = batch.edges.find((e) => e.source === 'new-sperm-source');
    expect(donorEdge?.data.attributes).toMatchObject({
      [variableConfig.relationshipTypeVariable]: ['donor'],
      [variableConfig.isActiveVariable]: true,
    });
  });

  it('creates child with unnamed other parent', () => {
    const values: Record<string, unknown> = {
      'child': { name: 'Baby' },
      'egg-source': egoId,
      'sperm-source': 'new',
      'new-sperm-source': { name: '' },
      'egg-parent-carried': true,
    };

    const batch = childCellTransform(
      values,
      egoId,
      makeNodes(),
      makeEdges(),
      variableConfig,
    );

    expect(batch.nodes).toHaveLength(2);
    expect(batch.nodes[1]).toMatchObject({
      tempId: 'new-sperm-source',
      data: {
        attributes: {
          name: '',
          [variableConfig.egoVariable]: false,
        },
      },
    });

    const newParentEdge = batch.edges.find(
      (e) => e.source === 'new-sperm-source',
    );
    expect(newParentEdge?.data.attributes).toMatchObject({
      [variableConfig.relationshipTypeVariable]: ['biological'],
      [variableConfig.isActiveVariable]: true,
    });
  });

  it('creates child with new surrogate carrier', () => {
    const values: Record<string, unknown> = {
      'child': { name: 'Baby' },
      'egg-source': egoId,
      'sperm-source': partnerId,
      'egg-parent-carried': false,
      'carrier-source': 'new',
      'new-carrier': {
        'name-known': true,
        'name': 'Surrogate Sue',
      },
    };

    const batch = childCellTransform(
      values,
      egoId,
      makeNodes(),
      makeEdges(),
      variableConfig,
    );

    const surrogateNode = batch.nodes.find((n) => n.tempId === 'new-carrier');
    expect(surrogateNode?.data.attributes).toMatchObject({
      name: 'Surrogate Sue',
    });

    const surrogateEdge = batch.edges.find((e) => e.source === 'new-carrier');
    expect(surrogateEdge?.data.attributes).toMatchObject({
      [variableConfig.relationshipTypeVariable]: ['surrogate'],
      [variableConfig.isActiveVariable]: true,
      [variableConfig.isGestationalCarrierVariable]: true,
    });
  });

  it('carrier same as egg source does not duplicate the node or edge', () => {
    const values: Record<string, unknown> = {
      'child': { name: 'Baby' },
      'egg-source': egoId,
      'sperm-source': partnerId,
      'egg-parent-carried': true,
    };

    const batch = childCellTransform(
      values,
      egoId,
      makeNodes(),
      makeEdges(),
      variableConfig,
    );

    expect(batch.nodes).toHaveLength(1);

    // The egg parent who also carried has a single edge, flagged as the
    // gestational carrier — not a duplicate carrier edge.
    const egoEdges = batch.edges.filter((e) => e.source === egoId);
    expect(egoEdges).toHaveLength(1);
    expect(egoEdges[0]?.data.attributes).toMatchObject({
      [variableConfig.relationshipTypeVariable]: ['biological'],
      [variableConfig.isActiveVariable]: true,
      [variableConfig.isGestationalCarrierVariable]: true,
    });
  });
});
