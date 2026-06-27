import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { buildGeneticGraph, type GeneticGraph } from '../geneticGraph';
import {
  computeAutosomalDominant,
  computeAutosomalRecessive,
} from '../patterns/autosomal';
import type { Status } from '../status';

const RELATIONSHIP_TYPE_VAR = 'relationshipType';
const config = { relationshipTypeVariable: RELATIONSHIP_TYPE_VAR };

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

// Autosomal rules never consult sex; a trivial stub satisfies buildGeneticGraph.
const stubSex = (): 'female' | 'male' | 'unknown' => 'unknown';

function buildGraph(nodes: NcNode[], edges: NcEdge[]): GeneticGraph {
  return buildGeneticGraph(nodes, edges, config, stubSex);
}

function status(map: Map<string, Status>, id: string): Status {
  return map.get(id) ?? 'unknown';
}

describe('computeAutosomalDominant', () => {
  describe('skipped generation (reduced penetrance)', () => {
    /**
     *   grandparent (affected)
     *        |
     *      parent (unaffected)   <- child of affected AND parent of affected
     *        |
     *      child (affected)
     *        |
     *    grandchild (unaffected)
     */
    const nodes = [
      makeNode('grandparent'),
      makeNode('parent'),
      makeNode('child'),
      makeNode('grandchild'),
    ];
    const edges = [
      makeGeneticEdge('grandparent', 'parent'),
      makeGeneticEdge('parent', 'child'),
      makeGeneticEdge('child', 'grandchild'),
    ];
    const graph = buildGraph(nodes, edges);
    const affected = new Set(['grandparent', 'child']);
    const result = computeAutosomalDominant(graph, affected);

    it('marks the affected grandparent and child as affected', () => {
      expect(status(result, 'grandparent')).toBe('affected');
      expect(status(result, 'child')).toBe('affected');
    });

    it('marks the unaffected middle parent as obligateCarrier', () => {
      expect(status(result, 'parent')).toBe('obligateCarrier');
    });

    it("marks the affected child's unaffected children as atRiskAffected", () => {
      expect(status(result, 'grandchild')).toBe('atRiskAffected');
    });
  });

  describe('de novo (no affected ancestor)', () => {
    /**
     *   mother (unaffected)   father (unaffected)
     *               \         /
     *              child (affected)
     */
    const nodes = [makeNode('mother'), makeNode('father'), makeNode('child')];
    const edges = [
      makeGeneticEdge('mother', 'child'),
      makeGeneticEdge('father', 'child'),
    ];
    const graph = buildGraph(nodes, edges);
    const affected = new Set(['child']);
    const result = computeAutosomalDominant(graph, affected);

    it('marks the affected child as affected', () => {
      expect(status(result, 'child')).toBe('affected');
    });

    it('NEVER marks the parents of a de-novo affected person as obligateCarrier', () => {
      expect(status(result, 'mother')).not.toBe('obligateCarrier');
      expect(status(result, 'father')).not.toBe('obligateCarrier');
    });

    it('marks the de-novo parents as atRiskAffected or unknown', () => {
      expect(['atRiskAffected', 'unknown']).toContain(status(result, 'mother'));
      expect(['atRiskAffected', 'unknown']).toContain(status(result, 'father'));
    });
  });

  describe('recursive descendant propagation', () => {
    /**
     *   affected
     *      |
     *    childA (unaffected)
     *      |
     *  grandchildA (unaffected)
     *      |
     * greatGrandchildA (unaffected)
     */
    const nodes = [
      makeNode('affected'),
      makeNode('childA'),
      makeNode('grandchildA'),
      makeNode('greatGrandchildA'),
    ];
    const edges = [
      makeGeneticEdge('affected', 'childA'),
      makeGeneticEdge('childA', 'grandchildA'),
      makeGeneticEdge('grandchildA', 'greatGrandchildA'),
    ];
    const graph = buildGraph(nodes, edges);
    const affected = new Set(['affected']);
    const result = computeAutosomalDominant(graph, affected);

    it('propagates atRiskAffected down every generation of the lineage', () => {
      expect(status(result, 'childA')).toBe('atRiskAffected');
      expect(status(result, 'grandchildA')).toBe('atRiskAffected');
      expect(status(result, 'greatGrandchildA')).toBe('atRiskAffected');
    });
  });

  describe('consanguinity-loop termination', () => {
    // A → B → C → A cycle plus an affected seed; must terminate.
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
    const edges = [
      makeGeneticEdge('A', 'B'),
      makeGeneticEdge('B', 'C'),
      makeGeneticEdge('C', 'A'),
    ];
    const graph = buildGraph(nodes, edges);
    const affected = new Set(['A']);

    it('terminates without throwing on a cyclic pedigree', () => {
      expect(() => computeAutosomalDominant(graph, affected)).not.toThrow();
    });
  });
});

describe('computeAutosomalRecessive', () => {
  describe('obligate carriers around an affected person', () => {
    /**
     *   mother (unaffected)  father (unaffected)
     *               \        /
     *             affected
     *                |
     *              child (unaffected)
     */
    const nodes = [
      makeNode('mother'),
      makeNode('father'),
      makeNode('affected'),
      makeNode('child'),
    ];
    const edges = [
      makeGeneticEdge('mother', 'affected'),
      makeGeneticEdge('father', 'affected'),
      makeGeneticEdge('affected', 'child'),
    ];
    const graph = buildGraph(nodes, edges);
    const affected = new Set(['affected']);
    const result = computeAutosomalRecessive(graph, affected);

    it('marks the affected person as affected', () => {
      expect(status(result, 'affected')).toBe('affected');
    });

    it('marks both biological parents of the affected as obligateCarrier', () => {
      expect(status(result, 'mother')).toBe('obligateCarrier');
      expect(status(result, 'father')).toBe('obligateCarrier');
    });

    it('marks every child of the affected as obligateCarrier', () => {
      expect(status(result, 'child')).toBe('obligateCarrier');
    });
  });

  describe('full sibling vs half sibling of an affected person', () => {
    /**
     *   mother (unaffected) --- father (unaffected)
     *        |          |
     *     affected   fullSib (unaffected)   <- both carrier parents -> atRiskAffected
     *        |
     *   mother also has halfSib with otherFather:
     *
     *   mother --- otherFather
     *        |
     *     halfSib (unaffected)   <- one carrier parent (mother) -> atRiskCarrier
     */
    const nodes = [
      makeNode('mother'),
      makeNode('father'),
      makeNode('otherFather'),
      makeNode('affected'),
      makeNode('fullSib'),
      makeNode('halfSib'),
    ];
    const edges = [
      makeGeneticEdge('mother', 'affected'),
      makeGeneticEdge('father', 'affected'),
      makeGeneticEdge('mother', 'fullSib'),
      makeGeneticEdge('father', 'fullSib'),
      makeGeneticEdge('mother', 'halfSib'),
      makeGeneticEdge('otherFather', 'halfSib'),
    ];
    const graph = buildGraph(nodes, edges);
    const affected = new Set(['affected']);
    const result = computeAutosomalRecessive(graph, affected);

    it('marks an unaffected FULL sibling of the affected as atRiskAffected (25%)', () => {
      expect(status(result, 'fullSib')).toBe('atRiskAffected');
    });

    it('marks an unaffected HALF sibling (one carrier parent) as atRiskCarrier', () => {
      expect(status(result, 'halfSib')).toBe('atRiskCarrier');
    });
  });

  describe('grandparents, aunts, and uncles of an affected person', () => {
    /**
     *   gpMat --- gmMat            gpPat --- gmPat
     *        |                          |
     *     mother    auntMat          father   uncPat
     *        \________________________/
     *               affected
     *
     *   mother & father are obligate carriers (parents of affected).
     *   gpMat/gmMat/gpPat/gmPat (grandparents) and auntMat/uncPat
     *   (mother's & father's sibs) each carry a 50% prior -> atRiskCarrier.
     */
    const nodes = [
      makeNode('gpMat'),
      makeNode('gmMat'),
      makeNode('gpPat'),
      makeNode('gmPat'),
      makeNode('mother'),
      makeNode('father'),
      makeNode('auntMat'),
      makeNode('uncPat'),
      makeNode('affected'),
    ];
    const edges = [
      makeGeneticEdge('gpMat', 'mother'),
      makeGeneticEdge('gmMat', 'mother'),
      makeGeneticEdge('gpMat', 'auntMat'),
      makeGeneticEdge('gmMat', 'auntMat'),
      makeGeneticEdge('gpPat', 'father'),
      makeGeneticEdge('gmPat', 'father'),
      makeGeneticEdge('gpPat', 'uncPat'),
      makeGeneticEdge('gmPat', 'uncPat'),
      makeGeneticEdge('mother', 'affected'),
      makeGeneticEdge('father', 'affected'),
    ];
    const graph = buildGraph(nodes, edges);
    const affected = new Set(['affected']);
    const result = computeAutosomalRecessive(graph, affected);

    it('marks the obligate carrier parents', () => {
      expect(status(result, 'mother')).toBe('obligateCarrier');
      expect(status(result, 'father')).toBe('obligateCarrier');
    });

    it('marks the four grandparents as atRiskCarrier', () => {
      expect(status(result, 'gpMat')).toBe('atRiskCarrier');
      expect(status(result, 'gmMat')).toBe('atRiskCarrier');
      expect(status(result, 'gpPat')).toBe('atRiskCarrier');
      expect(status(result, 'gmPat')).toBe('atRiskCarrier');
    });

    it('marks the maternal aunt and paternal uncle as atRiskCarrier', () => {
      expect(status(result, 'auntMat')).toBe('atRiskCarrier');
      expect(status(result, 'uncPat')).toBe('atRiskCarrier');
    });
  });

  describe('consanguinity-loop termination', () => {
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
    const edges = [
      makeGeneticEdge('A', 'B'),
      makeGeneticEdge('B', 'C'),
      makeGeneticEdge('C', 'A'),
    ];
    const graph = buildGraph(nodes, edges);
    const affected = new Set(['A']);

    it('terminates without throwing on a cyclic pedigree', () => {
      expect(() => computeAutosomalRecessive(graph, affected)).not.toThrow();
    });
  });
});
