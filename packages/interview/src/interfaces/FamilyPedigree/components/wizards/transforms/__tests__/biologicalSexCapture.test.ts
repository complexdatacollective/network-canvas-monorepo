import { describe, expect, it } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';
import type { NcEdge, NcNode } from '@codaco/shared-consts';

import type { VariableConfig } from '../../../../store';
import { siblingCellTransform } from '../siblingCellTransform';

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

function makeNodes(
  entries: [string, { isEgo?: boolean; name?: string }][],
): Map<string, NcNode> {
  const map = new Map<string, NcNode>();
  for (const [id, { isEgo, name }] of entries) {
    map.set(id, {
      _uid: id,
      type: 'person',
      [entityAttributesProperty]: {
        [variableConfig.egoVariable]: isEgo ?? false,
        name: name ?? '',
      },
    });
  }
  return map;
}

const emptyEdges = new Map<string, NcEdge>();

describe('biologicalSex capture — siblingCellTransform', () => {
  it('writes biologicalSex attribute on a new sibling person when value is provided', () => {
    const nodes = makeNodes([['anchor', { isEgo: false, name: 'Anchor' }]]);

    const values: Record<string, unknown> = {
      'sibling': { name: 'Alice', biologicalSex: 'female' },
      'egg-source': 'new',
      'new-egg-source': { name: 'Mom', biologicalSex: 'female' },
      'sperm-source': 'new',
      'new-sperm-source': { name: 'Dad', biologicalSex: 'male' },
      'egg-parent-carried': true,
    };

    const batch = siblingCellTransform(
      values,
      'anchor',
      nodes,
      emptyEdges,
      variableConfig,
    );

    const siblingNode = batch.nodes.find((n) => n.tempId === 'sibling');
    expect(
      siblingNode?.data.attributes[variableConfig.biologicalSexVariable],
    ).toEqual(['female']);
  });

  it('does NOT write biologicalSex on egg-source or sperm-source new person nodes (gamete parents derive sex from role)', () => {
    const nodes = makeNodes([['anchor', { isEgo: false, name: 'Anchor' }]]);

    const values: Record<string, unknown> = {
      'sibling': { name: 'Alex' },
      'egg-source': 'new',
      'new-egg-source': { name: 'Mom' },
      'sperm-source': 'new',
      'new-sperm-source': { name: 'Dad' },
      'egg-parent-carried': true,
    };

    const batch = siblingCellTransform(
      values,
      'anchor',
      nodes,
      emptyEdges,
      variableConfig,
    );

    const eggSourceNode = batch.nodes.find(
      (n) => n.tempId === 'new-egg-source',
    );
    const spermSourceNode = batch.nodes.find(
      (n) => n.tempId === 'new-sperm-source',
    );

    expect(
      eggSourceNode?.data.attributes[variableConfig.biologicalSexVariable],
    ).toBeUndefined();
    expect(
      spermSourceNode?.data.attributes[variableConfig.biologicalSexVariable],
    ).toBeUndefined();
  });

  it('new carrier-source DOES get biologicalSex (carrier is not a gamete parent)', () => {
    const nodes = makeNodes([['anchor', { isEgo: false, name: 'Anchor' }]]);

    // siblingCellTransform uses new-${roleKey} namespace, so 'new-carrier-source' for carrier
    const values: Record<string, unknown> = {
      'sibling': { name: 'Alex' },
      'egg-source': 'new',
      'new-egg-source': { name: 'Donor' },
      'sperm-source': 'new',
      'new-sperm-source': { name: 'Dad' },
      'egg-parent-carried': false,
      'carrier-source': 'new',
      'new-carrier-source': { name: 'Surrogate Sue', biologicalSex: 'female' },
    };

    const batch = siblingCellTransform(
      values,
      'anchor',
      nodes,
      emptyEdges,
      variableConfig,
    );

    const carrierNode = batch.nodes.find(
      (n) => n.tempId === 'new-carrier-source',
    );
    expect(carrierNode).toBeDefined();
    expect(
      carrierNode?.data.attributes[variableConfig.biologicalSexVariable],
    ).toEqual(['female']);
  });

  it('does not write biologicalSex when the value is not a valid BiologicalSex', () => {
    const nodes = makeNodes([['anchor', { isEgo: false, name: 'Anchor' }]]);

    const values: Record<string, unknown> = {
      'sibling': { name: 'Alex', biologicalSex: 'invalid-value' },
      'egg-source': 'new',
      'new-egg-source': { name: 'Mom' },
      'sperm-source': 'new',
      'new-sperm-source': { name: 'Dad' },
      'egg-parent-carried': true,
    };

    const batch = siblingCellTransform(
      values,
      'anchor',
      nodes,
      emptyEdges,
      variableConfig,
    );

    const siblingNode = batch.nodes.find((n) => n.tempId === 'sibling');
    expect(
      siblingNode?.data.attributes[variableConfig.biologicalSexVariable],
    ).toBeUndefined();
  });
});
