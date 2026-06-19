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
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'rel',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGC',
};

function edge(
  from: string,
  to: string,
  rel: string,
  isGC = false,
): [string, NcEdge] {
  const id = `${from}->${to}:${rel}`;
  return [
    id,
    {
      _uid: id,
      type: 'family',
      from,
      to,
      attributes: isGC
        ? { rel, isActive: true, isGC: true }
        : { rel, isActive: true },
    },
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
  function optionValues(childId: string, edges: Map<string, NcEdge>): string[] {
    return addableParentTypeOptions(childId, edges, variableConfig).map(
      (o) => o.value,
    );
  }

  it('excludes biological and donor once both gamete parents are known', () => {
    const edges = new Map<string, NcEdge>([
      edge('mum', 'kid', 'biological'),
      edge('dad', 'kid', 'biological'),
    ]);
    const values = optionValues('kid', edges);
    expect(values).not.toContain('biological');
    expect(values).not.toContain('donor');
    expect(values).toContain('social');
    expect(values).toContain('surrogate'); // no carrier recorded yet
  });

  it('excludes surrogate when the egg parent also carried', () => {
    const edges = new Map<string, NcEdge>([
      edge('mum', 'kid', 'biological', true), // egg parent who also carried
      edge('dad', 'kid', 'biological'),
    ]);
    const values = optionValues('kid', edges);
    expect(values).not.toContain('surrogate');
    expect(values).not.toContain('biological');
    expect(values).not.toContain('donor');
    expect(values).toContain('social');
  });

  it('excludes surrogate when a separate gestational carrier exists, independent of the genetic slots', () => {
    const edges = new Map<string, NcEdge>([
      edge('mum', 'kid', 'biological'),
      edge('surr', 'kid', 'surrogate', true),
    ]);
    const values = optionValues('kid', edges);
    expect(values).not.toContain('surrogate');
    // only one genetic parent so far, so a second is still offerable
    expect(values).toContain('biological');
    expect(values).toContain('donor');
    expect(values).toContain('social');
  });

  it('offers all types when no roles are filled', () => {
    const values = optionValues('kid', new Map<string, NcEdge>());
    expect(values).toContain('biological');
    expect(values).toContain('donor');
    expect(values).toContain('surrogate');
    expect(values).toContain('social');
  });
});
