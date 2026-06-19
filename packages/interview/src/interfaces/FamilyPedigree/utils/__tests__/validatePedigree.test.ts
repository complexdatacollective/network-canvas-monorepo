import { describe, expect, it } from 'vitest';

import type { NcEdge, NcNode } from '@codaco/shared-consts';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import { validatePedigreeCompleteness } from '../validatePedigree';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'rel',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGest',
};

function makeNodes(
  entries: [string, { isEgo?: boolean; name?: string }][],
): Map<string, NcNode> {
  const map = new Map<string, NcNode>();
  for (const [id, { isEgo, name }] of entries) {
    map.set(id, {
      _uid: id,
      type: 'person',
      attributes: {
        [variableConfig.egoVariable]: isEgo ?? false,
        [variableConfig.nodeLabelVariable]: name ?? '',
      },
    });
  }
  return map;
}

function makeEdges(entries: [string, string, string][]): Map<string, NcEdge> {
  const map = new Map<string, NcEdge>();
  for (const [source, target, relType] of entries) {
    const id = `${source}->${target}`;
    map.set(id, {
      _uid: id,
      type: 'family',
      from: source,
      to: target,
      attributes: {
        [variableConfig.relationshipTypeVariable]: [relType],
        [variableConfig.isActiveVariable]: true,
      },
    });
  }
  return map;
}

describe('validatePedigreeCompleteness', () => {
  it('passes for ego with two parents and no grandparents (grandparents not required)', () => {
    const nodes = makeNodes([
      ['ego', { isEgo: true }],
      ['mum', { name: 'Mum' }],
      ['dad', { name: 'Dad' }],
    ]);

    const edges = makeEdges([
      ['mum', 'ego', 'biological'],
      ['dad', 'ego', 'biological'],
    ]);

    const issues = validatePedigreeCompleteness(nodes, edges, variableConfig);
    expect(issues).toHaveLength(0);
  });

  it('does not require grandparents for an adopted ego with adoptive parents', () => {
    const nodes = makeNodes([
      ['ego', { isEgo: true }],
      ['mum', { name: 'Adoptive Mum' }],
      ['dad', { name: 'Adoptive Dad' }],
    ]);

    const edges = makeEdges([
      ['mum', 'ego', 'adoptive'],
      ['dad', 'ego', 'adoptive'],
    ]);

    const issues = validatePedigreeCompleteness(nodes, edges, variableConfig);
    expect(issues).toHaveLength(0);
  });

  it('flags ego missing parents', () => {
    const nodes = makeNodes([['ego', { isEgo: true }]]);
    const edges = makeEdges([]);

    const issues = validatePedigreeCompleteness(nodes, edges, variableConfig);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('You');
  });

  it('flags ego with only one parent', () => {
    const nodes = makeNodes([
      ['ego', { isEgo: true }],
      ['mum', { name: 'Mum' }],
    ]);
    const edges = makeEdges([['mum', 'ego', 'biological']]);

    const issues = validatePedigreeCompleteness(nodes, edges, variableConfig);
    expect(issues.some((i) => i.nodeId === 'ego')).toBe(true);
  });

  it('counts donor edges toward ego parents', () => {
    const nodes = makeNodes([
      ['ego', { isEgo: true }],
      ['mum', { name: 'Mum' }],
      ['donor', { name: 'Donor' }],
    ]);
    const edges = makeEdges([
      ['mum', 'ego', 'biological'],
      ['donor', 'ego', 'donor'],
    ]);

    const issues = validatePedigreeCompleteness(nodes, edges, variableConfig);
    expect(issues).toHaveLength(0);
  });

  it('does not count social edges toward ego parents', () => {
    const nodes = makeNodes([
      ['ego', { isEgo: true }],
      ['mum', { name: 'Mum' }],
      ['step', { name: 'Step-dad' }],
    ]);
    const edges = makeEdges([
      ['mum', 'ego', 'biological'],
      ['step', 'ego', 'social'],
    ]);

    const issues = validatePedigreeCompleteness(nodes, edges, variableConfig);
    expect(issues.some((i) => i.nodeId === 'ego')).toBe(true);
  });

  it('does not count partner edges toward ego parents', () => {
    const nodes = makeNodes([
      ['ego', { isEgo: true }],
      ['mum', { name: 'Mum' }],
      ['dad', { name: 'Dad' }],
    ]);
    const edges = makeEdges([
      ['mum', 'ego', 'biological'],
      ['dad', 'ego', 'partner'],
    ]);

    const issues = validatePedigreeCompleteness(nodes, edges, variableConfig);
    expect(issues.some((i) => i.nodeId === 'ego')).toBe(true);
  });
});
