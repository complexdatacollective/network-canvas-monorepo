import { describe, expect, it } from 'vitest';

import { INHERITANCE_PATTERNS } from '@codaco/protocol-validation';

import { computeStatuses } from '../computeStatuses';
import {
  buildGeneticGraph,
  type GeneticLink,
  type GeneticGraph,
  type GeneticPerson,
} from '../geneticGraph';
import type { Status } from '../status';

type Sex = 'female' | 'male' | 'unknown';

function makeNode(id: string): GeneticPerson {
  return { id };
}

function makeGeneticEdge(from: string, to: string): GeneticLink {
  return { source: from, target: to, kind: 'biological' };
}

function sexResolver(sexes: Record<string, Sex>): (id: string) => Sex {
  return (id: string): Sex => sexes[id] ?? 'unknown';
}

function buildGraph(
  nodes: GeneticPerson[],
  edges: GeneticLink[],
  resolveSex: (id: string) => Sex,
): GeneticGraph {
  return buildGeneticGraph({ people: nodes, links: edges }, resolveSex);
}

function status(map: Map<string, Status>, id: string): Status {
  return map.get(id) ?? 'unknown';
}

describe('computeStatuses', () => {
  describe('multifactorial: only affected nodes are affected, everyone else omitted', () => {
    /**
     *   parent (NOT affected)
     *        |
     *   affectedChild (affected)
     *        |
     *   grandchild (NOT affected)
     *
     *   No carrier / at-risk inference for multifactorial: only the affected node
     *   is `affected`; everyone else is omitted (= unknown).
     */
    const nodes = [
      makeNode('parent'),
      makeNode('affectedChild'),
      makeNode('grandchild'),
    ];
    const edges = [
      makeGeneticEdge('parent', 'affectedChild'),
      makeGeneticEdge('affectedChild', 'grandchild'),
    ];
    const resolveSex = sexResolver({
      parent: 'female',
      affectedChild: 'female',
      grandchild: 'female',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedChild']);
    const result = computeStatuses(
      graph,
      affected,
      'multifactorial',
      resolveSex,
    );

    it('marks the affected node as affected', () => {
      expect(status(result, 'affectedChild')).toBe('affected');
    });

    it('omits the parent (no carrier inference)', () => {
      expect(status(result, 'parent')).toBe('unknown');
      expect(result.has('parent')).toBe(false);
    });

    it('omits the descendant (no at-risk inference)', () => {
      expect(status(result, 'grandchild')).toBe('unknown');
      expect(result.has('grandchild')).toBe(false);
    });
  });

  describe('unknown pattern: only affected nodes are affected, everyone else omitted', () => {
    const nodes = [
      makeNode('parent'),
      makeNode('affectedChild'),
      makeNode('grandchild'),
    ];
    const edges = [
      makeGeneticEdge('parent', 'affectedChild'),
      makeGeneticEdge('affectedChild', 'grandchild'),
    ];
    const resolveSex = sexResolver({
      parent: 'female',
      affectedChild: 'female',
      grandchild: 'female',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedChild']);
    const result = computeStatuses(graph, affected, 'unknown', resolveSex);

    it('marks the affected node as affected and omits everyone else', () => {
      expect(status(result, 'affectedChild')).toBe('affected');
      expect(result.has('parent')).toBe(false);
      expect(result.has('grandchild')).toBe(false);
    });
  });

  describe('dispatch routes each pattern to the right module', () => {
    it('autosomalDominant: a descendant of an affected node becomes atRiskAffected (AD module)', () => {
      /**
       *   affectedParent (affected) -> child (atRiskAffected via AD descent)
       *   AD marks descendants atRiskAffected; the other modules would not (a
       *   recessive / uniparental module leaves a lone child differently).
       */
      const nodes = [makeNode('affectedParent'), makeNode('child')];
      const edges = [makeGeneticEdge('affectedParent', 'child')];
      const resolveSex = sexResolver({
        affectedParent: 'female',
        child: 'female',
      });
      const graph = buildGraph(nodes, edges, resolveSex);
      const result = computeStatuses(
        graph,
        new Set(['affectedParent']),
        'autosomalDominant',
        resolveSex,
      );
      expect(status(result, 'child')).toBe('atRiskAffected');
    });

    it('autosomalRecessive: both parents of an affected node become obligateCarrier (AR module)', () => {
      /**
       *   mother --- father
       *        \     /
       *      affectedChild (affected)
       *   AR makes BOTH parents obligateCarrier; no other module does this.
       */
      const nodes = [
        makeNode('mother'),
        makeNode('father'),
        makeNode('affectedChild'),
      ];
      const edges = [
        makeGeneticEdge('mother', 'affectedChild'),
        makeGeneticEdge('father', 'affectedChild'),
      ];
      const resolveSex = sexResolver({
        mother: 'female',
        father: 'male',
        affectedChild: 'female',
      });
      const graph = buildGraph(nodes, edges, resolveSex);
      const result = computeStatuses(
        graph,
        new Set(['affectedChild']),
        'autosomalRecessive',
        resolveSex,
      );
      expect(status(result, 'mother')).toBe('obligateCarrier');
      expect(status(result, 'father')).toBe('obligateCarrier');
    });

    it('xLinkedRecessive: a daughter of an affected male becomes obligateCarrier (XLR module)', () => {
      const nodes = [makeNode('affectedMale'), makeNode('daughter')];
      const edges = [makeGeneticEdge('affectedMale', 'daughter')];
      const resolveSex = sexResolver({
        affectedMale: 'male',
        daughter: 'female',
      });
      const graph = buildGraph(nodes, edges, resolveSex);
      const result = computeStatuses(
        graph,
        new Set(['affectedMale']),
        'xLinkedRecessive',
        resolveSex,
      );
      expect(status(result, 'daughter')).toBe('obligateCarrier');
    });

    it('xLinkedDominant: a daughter of an affected male becomes obligateAffected (XLD module)', () => {
      const nodes = [makeNode('affectedMale'), makeNode('daughter')];
      const edges = [makeGeneticEdge('affectedMale', 'daughter')];
      const resolveSex = sexResolver({
        affectedMale: 'male',
        daughter: 'female',
      });
      const graph = buildGraph(nodes, edges, resolveSex);
      const result = computeStatuses(
        graph,
        new Set(['affectedMale']),
        'xLinkedDominant',
        resolveSex,
      );
      expect(status(result, 'daughter')).toBe('obligateAffected');
    });

    it('yLinked: a son of an affected male becomes obligateAffected (Y module)', () => {
      const nodes = [makeNode('affectedMale'), makeNode('son')];
      const edges = [makeGeneticEdge('affectedMale', 'son')];
      const resolveSex = sexResolver({
        affectedMale: 'male',
        son: 'male',
      });
      const graph = buildGraph(nodes, edges, resolveSex);
      const result = computeStatuses(
        graph,
        new Set(['affectedMale']),
        'yLinked',
        resolveSex,
      );
      expect(status(result, 'son')).toBe('obligateAffected');
    });

    it('mitochondrial: a child of an affected female becomes atRiskAffected (mito module)', () => {
      const nodes = [makeNode('affectedFemale'), makeNode('child')];
      const edges = [makeGeneticEdge('affectedFemale', 'child')];
      const resolveSex = sexResolver({
        affectedFemale: 'female',
        child: 'female',
      });
      const graph = buildGraph(nodes, edges, resolveSex);
      const result = computeStatuses(
        graph,
        new Set(['affectedFemale']),
        'mitochondrial',
        resolveSex,
      );
      expect(status(result, 'child')).toBe('atRiskAffected');
    });
  });

  describe('every inheritance pattern is handled (exhaustive dispatch, no throw)', () => {
    const nodes = [makeNode('affectedMale'), makeNode('son')];
    const edges = [makeGeneticEdge('affectedMale', 'son')];
    const resolveSex = sexResolver({ affectedMale: 'male', son: 'male' });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedMale']);

    for (const pattern of INHERITANCE_PATTERNS) {
      it(`handles ${pattern} without throwing and always marks the affected node`, () => {
        const result = computeStatuses(graph, affected, pattern, resolveSex);
        expect(status(result, 'affectedMale')).toBe('affected');
      });
    }
  });
});
