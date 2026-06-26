import { describe, expect, it } from 'vitest';

import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import { defineParentsTransform } from '../defineParentsTransform';

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

describe('defineParentsTransform', () => {
  it('attaches genetic parents to the existing focal node without creating it', () => {
    const batch = defineParentsTransform(
      {
        'egg-source': 'new',
        'new-egg-source': { name: 'Mum' },
        'sperm-source': 'donor-1',
        'sperm-source-is-donor': true,
        'egg-parent-carried': true,
      },
      'focal-1',
      variableConfig,
    );

    expect(batch.nodes.some((n) => n.tempId === 'focal-1')).toBe(false);
    expect(
      batch.edges.some(
        (e) =>
          e.source === 'donor-1' &&
          e.target === 'focal-1' &&
          e.data.attributes[variableConfig.gameteRoleVariable] === 'sperm',
      ),
    ).toBe(true);
    const mum = batch.nodes.find((n) => n.tempId === 'new-egg-source');
    expect(mum?.data.attributes.name).toBe('Mum');
  });
});
