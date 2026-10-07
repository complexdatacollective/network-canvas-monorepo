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

  describe('multi-generation skip (two consecutive unaffected intermediates)', () => {
    /**
     *   A (affected)
     *      |
     *    B (unaffected)   <- affected ancestor A AND affected descendant D
     *      |
     *    C (unaffected)   <- affected ancestor A AND affected descendant D
     *      |
     *    D (affected)
     */
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C'), makeNode('D')];
    const edges = [
      makeGeneticEdge('A', 'B'),
      makeGeneticEdge('B', 'C'),
      makeGeneticEdge('C', 'D'),
    ];
    const graph = buildGraph(nodes, edges);
    const affected = new Set(['A', 'D']);
    const result = computeAutosomalDominant(graph, affected);

    it('marks BOTH unaffected intermediates as obligateCarrier', () => {
      expect(status(result, 'B')).toBe('obligateCarrier');
      expect(status(result, 'C')).toBe('obligateCarrier');
    });

    it('keeps the affected endpoints affected', () => {
      expect(status(result, 'A')).toBe('affected');
      expect(status(result, 'D')).toBe('affected');
    });
  });

  describe('married-in affected spouse (no false obligate-carrier over-call)', () => {
    /**
     *   G (affected)
     *      |
     *    U (unaffected)  ---  S (affected, married-in)
     *               \        /
     *              K (affected)
     *
     *   K's affection is fully explained by the married-in affected spouse S,
     *   so U need NOT carry the allele: U is at risk (descendant of affected G)
     *   but is NOT an obligate carrier.
     */
    const nodes = [makeNode('G'), makeNode('U'), makeNode('S'), makeNode('K')];
    const edges = [
      makeGeneticEdge('G', 'U'),
      makeGeneticEdge('U', 'K'),
      makeGeneticEdge('S', 'K'),
    ];
    const graph = buildGraph(nodes, edges);
    const affected = new Set(['G', 'S', 'K']);
    const result = computeAutosomalDominant(graph, affected);

    it('keeps the affected ancestor, spouse, and child affected', () => {
      expect(status(result, 'G')).toBe('affected');
      expect(status(result, 'S')).toBe('affected');
      expect(status(result, 'K')).toBe('affected');
    });

    it('marks U as atRiskAffected, NOT obligateCarrier', () => {
      expect(status(result, 'U')).toBe('atRiskAffected');
      expect(status(result, 'U')).not.toBe('obligateCarrier');
    });
  });

  describe('converging affected lineages (no double obligate-carrier over-call)', () => {
    /**
     *   G1 (affected)        G2 (affected)
     *        |                    |
     *      U (unaffected)       V (unaffected)
     *               \          /
     *                K (affected)
     *
     *   K is heterozygous (dominant) and carries ONE allele — from U OR from V,
     *   not both. Neither U nor V is an obligate carrier: each is an
     *   equally-plausible transmitter, so each is only `atRiskAffected`.
     */
    const nodes = [
      makeNode('G1'),
      makeNode('G2'),
      makeNode('U'),
      makeNode('V'),
      makeNode('K'),
    ];
    const edges = [
      makeGeneticEdge('G1', 'U'),
      makeGeneticEdge('G2', 'V'),
      makeGeneticEdge('U', 'K'),
      makeGeneticEdge('V', 'K'),
    ];
    const graph = buildGraph(nodes, edges);
    const affected = new Set(['G1', 'G2', 'K']);
    const result = computeAutosomalDominant(graph, affected);

    it('keeps the affected grandparents and child affected', () => {
      expect(status(result, 'G1')).toBe('affected');
      expect(status(result, 'G2')).toBe('affected');
      expect(status(result, 'K')).toBe('affected');
    });

    it('marks BOTH converging parents as atRiskAffected, NOT obligateCarrier', () => {
      expect(status(result, 'U')).toBe('atRiskAffected');
      expect(status(result, 'U')).not.toBe('obligateCarrier');
      expect(status(result, 'V')).toBe('atRiskAffected');
      expect(status(result, 'V')).not.toBe('obligateCarrier');
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

  describe('pseudodominance: child of two affected parents', () => {
    /**
     *   p1 (affected)   p2 (affected)
     *            \        /
     *           child (not nominated)   <- both parents homozygous affected -> 100%
     */
    const nodes = [makeNode('p1'), makeNode('p2'), makeNode('child')];
    const edges = [
      makeGeneticEdge('p1', 'child'),
      makeGeneticEdge('p2', 'child'),
    ];
    const graph = buildGraph(nodes, edges);
    const affected = new Set(['p1', 'p2']);
    const result = computeAutosomalRecessive(graph, affected);

    it('marks the non-nominated child of two affected parents as obligateAffected', () => {
      expect(status(result, 'child')).toBe('obligateAffected');
    });
  });

  describe('pseudodominance: grandchild of two affected grandparents', () => {
    /**
     *   p1 (affected)   p2 (affected)
     *            \        /
     *           child (not nominated -> obligateAffected, inferred aa)
     *              |        \
     *              |       spouse (not nominated)
     *               \      /
     *              gchild (not nominated)
     *
     *   A child of a homozygous-affected (aa) parent MUST inherit one allele,
     *   so gchild is an obligate CARRIER, not merely at-risk.
     */
    const nodes = [
      makeNode('p1'),
      makeNode('p2'),
      makeNode('child'),
      makeNode('spouse'),
      makeNode('gchild'),
    ];
    const edges = [
      makeGeneticEdge('p1', 'child'),
      makeGeneticEdge('p2', 'child'),
      makeGeneticEdge('child', 'gchild'),
      makeGeneticEdge('spouse', 'gchild'),
    ];
    const graph = buildGraph(nodes, edges);
    const affected = new Set(['p1', 'p2']);
    const result = computeAutosomalRecessive(graph, affected);

    it('infers the non-nominated child as obligateAffected', () => {
      expect(status(result, 'child')).toBe('obligateAffected');
    });

    it('marks the grandchild of an obligateAffected parent as obligateCarrier', () => {
      expect(status(result, 'gchild')).toBe('obligateCarrier');
    });
  });

  describe('full-vs-half unestablishable: sibling sharing only the recorded mother', () => {
    /**
     *   mother (the only recorded parent of either child)
     *      |        |
     *  affected    sib (unaffected)   <- no father recorded for either
     *
     *  Full-vs-half is NOT established: sib has at most ONE carrier parent
     *  (mother) -> downgrade to atRiskCarrier, NOT atRiskAffected.
     */
    const nodes = [makeNode('mother'), makeNode('affected'), makeNode('sib')];
    const edges = [
      makeGeneticEdge('mother', 'affected'),
      makeGeneticEdge('mother', 'sib'),
    ];
    const graph = buildGraph(nodes, edges);
    const affected = new Set(['affected']);
    const result = computeAutosomalRecessive(graph, affected);

    it('marks the affected person as affected', () => {
      expect(status(result, 'affected')).toBe('affected');
    });

    it('downgrades the same-recorded-parent sibling to atRiskCarrier', () => {
      expect(status(result, 'sib')).toBe('atRiskCarrier');
    });

    it('does NOT over-claim the sibling as atRiskAffected', () => {
      expect(status(result, 'sib')).not.toBe('atRiskAffected');
    });
  });

  describe('true full sibling with both parents recorded', () => {
    /**
     *   mother --- father (both recorded, shared by both children)
     *      |          |
     *   affected    sib (unaffected)   <- two carrier parents -> atRiskAffected (25%)
     */
    const nodes = [
      makeNode('mother'),
      makeNode('father'),
      makeNode('affected'),
      makeNode('sib'),
    ];
    const edges = [
      makeGeneticEdge('mother', 'affected'),
      makeGeneticEdge('father', 'affected'),
      makeGeneticEdge('mother', 'sib'),
      makeGeneticEdge('father', 'sib'),
    ];
    const graph = buildGraph(nodes, edges);
    const affected = new Set(['affected']);
    const result = computeAutosomalRecessive(graph, affected);

    it('marks a true full sibling (both carrier parents) as atRiskAffected', () => {
      expect(status(result, 'sib')).toBe('atRiskAffected');
    });
  });

  describe('married-in co-parent of an obligate carrier (child of affected)', () => {
    /**
     *   mother (unaffected) --- father (unaffected)
     *               \          /
     *              affected
     *                |     \
     *                |    spouse (married-in)
     *                 \    /
     *                child
     *
     *   `child` is an obligate carrier (child of an affected parent), but its
     *   certain disease allele comes from `affected` (its on-lineage parent).
     *   `spouse` married in — only population risk — so it must stay `unknown`,
     *   NOT `atRiskCarrier`. mother & father remain obligate carriers.
     */
    const nodes = [
      makeNode('mother'),
      makeNode('father'),
      makeNode('affected'),
      makeNode('spouse'),
      makeNode('child'),
    ];
    const edges = [
      makeGeneticEdge('mother', 'affected'),
      makeGeneticEdge('father', 'affected'),
      makeGeneticEdge('affected', 'child'),
      makeGeneticEdge('spouse', 'child'),
    ];
    const graph = buildGraph(nodes, edges);
    const affected = new Set(['affected']);
    const result = computeAutosomalRecessive(graph, affected);

    it('keeps both parents of the affected as obligateCarrier', () => {
      expect(status(result, 'mother')).toBe('obligateCarrier');
      expect(status(result, 'father')).toBe('obligateCarrier');
    });

    it('marks the child of the affected as obligateCarrier', () => {
      expect(status(result, 'child')).toBe('obligateCarrier');
    });

    it('leaves the married-in spouse unknown, NOT atRiskCarrier', () => {
      expect(status(result, 'spouse')).toBe('unknown');
      expect(status(result, 'spouse')).not.toBe('atRiskCarrier');
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
