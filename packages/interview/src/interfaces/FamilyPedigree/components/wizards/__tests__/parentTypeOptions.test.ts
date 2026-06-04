import { describe, expect, it } from 'vitest';

import type { NcEdge } from '@codaco/shared-consts';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import {
  addableParentTypeOptions,
  countGeneticParents,
} from '../parentTypeOptions';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipTypeVariable: 'rel',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGC',
};

function edge(from: string, to: string, rel: string): [string, NcEdge] {
  const id = `${from}->${to}:${rel}`;
  return [
    id,
    { _uid: id, type: 'family', from, to, attributes: { rel, isActive: true } },
  ];
}

describe('countGeneticParents', () => {
  it('counts biological and donor edges into the node, ignoring others', () => {
    const edges = new Map<string, NcEdge>([
      edge('mum', 'child', 'biological'),
      edge('donor', 'child', 'donor'),
      edge('surr', 'child', 'surrogate'),
      edge('step', 'child', 'social'),
      edge('child', 'gkid', 'biological'),
    ]);
    expect(countGeneticParents('child', edges, variableConfig)).toBe(2);
  });
});

describe('addableParentTypeOptions', () => {
  it('excludes biological and donor when both genetic slots are filled', () => {
    const values = addableParentTypeOptions(2).map((o) => o.value);
    expect(values).not.toContain('biological');
    expect(values).not.toContain('donor');
    expect(values).toContain('social');
  });

  it('offers all types when fewer than two genetic parents exist', () => {
    const values = addableParentTypeOptions(1).map((o) => o.value);
    expect(values).toContain('biological');
    expect(values).toContain('donor');
  });

  it('offers all types when there are no genetic parents', () => {
    const values = addableParentTypeOptions(0).map((o) => o.value);
    expect(values).toContain('biological');
    expect(values).toContain('donor');
  });
});
