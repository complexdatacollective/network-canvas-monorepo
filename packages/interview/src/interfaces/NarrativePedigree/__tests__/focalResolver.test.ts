import { describe, expect, it } from 'vitest';

import { FOCAL_POSITIONS } from '@codaco/shared-consts';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { resolveFocal } from '../focalResolver';
import { buildGeneticGraph } from '../genetics/geneticGraph';

const RELATIONSHIP_TYPE_VAR = 'relationshipType';

function makeNode(id: string): NcNode {
  return {
    [entityPrimaryKeyProperty]: id,
    type: 'person',
    [entityAttributesProperty]: {},
  };
}

function makeGeneticEdge(from: string, to: string): NcEdge {
  return {
    [entityPrimaryKeyProperty]: `${from}->${to}`,
    type: 'family',
    from,
    to,
    [entityAttributesProperty]: {
      [RELATIONSHIP_TYPE_VAR]: ['biological'],
    },
  };
}

const config = { relationshipTypeVariable: RELATIONSHIP_TYPE_VAR };

function stubResolveSex(): (id: string) => 'female' | 'male' | 'unknown' {
  return () => 'unknown';
}

/**
 * Fixture layout:
 *
 *   mother --- father
 *       |         |
 *       +---ego---+
 *       |         |
 *       +--fsib---+
 *       |
 *     hsib  (shares only mother)
 *       |
 *     child  (ego's child via separate edge)
 *
 *  ego → child
 */
const IDS = {
  ego: 'ego',
  mother: 'mother',
  father: 'father',
  fsib: 'fsib',
  hsib: 'hsib',
  child: 'child',
} as const;

const fixtureNodes: NcNode[] = Object.values(IDS).map(makeNode);

const fixtureEdges: NcEdge[] = [
  makeGeneticEdge(IDS.mother, IDS.ego),
  makeGeneticEdge(IDS.father, IDS.ego),
  makeGeneticEdge(IDS.mother, IDS.fsib),
  makeGeneticEdge(IDS.father, IDS.fsib),
  makeGeneticEdge(IDS.mother, IDS.hsib),
  makeGeneticEdge(IDS.ego, IDS.child),
];

const graph = buildGeneticGraph(
  fixtureNodes,
  fixtureEdges,
  config,
  stubResolveSex(),
);

describe('resolveFocal — FOCAL_POSITIONS coverage', () => {
  it('covers every value in FOCAL_POSITIONS', () => {
    // Ensures the switch is exhaustive — if a new position is added to
    // FOCAL_POSITIONS without updating resolveFocal, this test will fail.
    for (const position of FOCAL_POSITIONS) {
      expect(() => resolveFocal(position, graph, IDS.ego)).not.toThrow();
    }
  });

  it('ego → {ego}', () => {
    const result = resolveFocal('ego', graph, IDS.ego);
    expect(result).toEqual(new Set([IDS.ego]));
  });

  it('egoChildren → {child}', () => {
    const result = resolveFocal('egoChildren', graph, IDS.ego);
    expect(result).toEqual(new Set([IDS.child]));
  });

  it('egoParents → {mother, father}', () => {
    const result = resolveFocal('egoParents', graph, IDS.ego);
    expect(result).toEqual(new Set([IDS.mother, IDS.father]));
  });

  it('egoSiblings → includes both full and half sibs', () => {
    const result = resolveFocal('egoSiblings', graph, IDS.ego);
    expect(result.has(IDS.fsib)).toBe(true);
    expect(result.has(IDS.hsib)).toBe(true);
    expect(result.has(IDS.ego)).toBe(false);
  });

  it('everyone → all node ids', () => {
    const result = resolveFocal('everyone', graph, IDS.ego);
    for (const id of Object.values(IDS)) {
      expect(result.has(id)).toBe(true);
    }
    expect(result.size).toBe(Object.values(IDS).length);
  });
});

describe('resolveFocal — missing ego', () => {
  it('ego position → empty set when egoId is undefined', () => {
    const result = resolveFocal('ego', graph, undefined);
    expect(result.size).toBe(0);
  });

  it('ego position → empty set when egoId not in graph', () => {
    const result = resolveFocal('ego', graph, 'nonexistent');
    expect(result.size).toBe(0);
  });

  it('egoChildren → empty set when egoId is undefined', () => {
    expect(resolveFocal('egoChildren', graph, undefined).size).toBe(0);
  });

  it('egoParents → empty set when egoId is undefined', () => {
    expect(resolveFocal('egoParents', graph, undefined).size).toBe(0);
  });

  it('egoSiblings → empty set when egoId is undefined', () => {
    expect(resolveFocal('egoSiblings', graph, undefined).size).toBe(0);
  });

  it('everyone → all nodes even when egoId is undefined', () => {
    const result = resolveFocal('everyone', graph, undefined);
    expect(result.size).toBe(Object.values(IDS).length);
  });
});
