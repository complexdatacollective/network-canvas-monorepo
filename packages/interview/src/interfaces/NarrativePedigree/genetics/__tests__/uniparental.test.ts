import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { buildGeneticGraph, type GeneticGraph } from '../geneticGraph';
import { computeMitochondrial, computeYLinked } from '../patterns/uniparental';
import type { Status } from '../status';

const RELATIONSHIP_TYPE_VAR = 'relationshipType';
const config = { relationshipTypeVariable: RELATIONSHIP_TYPE_VAR };

type Sex = 'female' | 'male' | 'unknown';

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

/**
 * Build a `resolveSex` stub from a fixed map. The SAME stub is passed into
 * `buildGeneticGraph` (so `parentsOf` is sex-annotated) and into the pattern
 * functions, matching how the engine wires them at runtime.
 */
function sexResolver(sexes: Record<string, Sex>): (id: string) => Sex {
  return (id: string): Sex => sexes[id] ?? 'unknown';
}

function buildGraph(
  nodes: NcNode[],
  edges: NcEdge[],
  resolveSex: (id: string) => Sex,
): GeneticGraph {
  return buildGeneticGraph(nodes, edges, config, resolveSex);
}

function status(map: Map<string, Status>, id: string): Status {
  return map.get(id) ?? 'unknown';
}

describe('computeYLinked', () => {
  describe('male-line descent and ancestry of an affected male', () => {
    /**
     *   grandfather (male)
     *        |
     *     father (male)
     *        |
     *   affectedMale (affected)
     *        |          |
     *      son (male)  daughter (female)
     *        |
     *    grandson (male)
     *
     *   The Y passes father -> son in an unbroken male line. Every male in
     *   male-line descent FROM the affected male (son, grandson) AND every
     *   male-line ANCESTOR (father, grandfather) carries the same Y -> obligate-
     *   Affected. A daughter receives no Y -> nothing.
     */
    const nodes = [
      makeNode('grandfather'),
      makeNode('father'),
      makeNode('affectedMale'),
      makeNode('son'),
      makeNode('daughter'),
      makeNode('grandson'),
    ];
    const edges = [
      makeGeneticEdge('grandfather', 'father'),
      makeGeneticEdge('father', 'affectedMale'),
      makeGeneticEdge('affectedMale', 'son'),
      makeGeneticEdge('affectedMale', 'daughter'),
      makeGeneticEdge('son', 'grandson'),
    ];
    const resolveSex = sexResolver({
      grandfather: 'male',
      father: 'male',
      affectedMale: 'male',
      son: 'male',
      daughter: 'female',
      grandson: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedMale']);
    const result = computeYLinked(graph, affected, resolveSex);

    it('marks the affected male as affected', () => {
      expect(status(result, 'affectedMale')).toBe('affected');
    });

    it('marks every male in unbroken male-line descent as obligateAffected', () => {
      expect(status(result, 'son')).toBe('obligateAffected');
      expect(status(result, 'grandson')).toBe('obligateAffected');
    });

    it('marks every male-line ancestor as obligateAffected', () => {
      expect(status(result, 'father')).toBe('obligateAffected');
      expect(status(result, 'grandfather')).toBe('obligateAffected');
    });

    it('confers nothing on a daughter of the affected male (no Y)', () => {
      expect(status(result, 'daughter')).toBe('unknown');
    });
  });

  describe("an affected male's brother and nephew (collateral male line)", () => {
    /**
     *      father (male)
     *        |          |
     *  affectedMale   brother (male)   <- shares the father's Y -> obligateAffected
     *   (affected)        |
     *                  nephew (male)   <- brother's son, same Y -> obligateAffected
     *
     *   The brother carries the SAME Y as the affected male (both inherited it
     *   from their shared father). The fix re-descends from the shared father, so
     *   the brother AND his son (the nephew) are reached.
     */
    const nodes = [
      makeNode('father'),
      makeNode('affectedMale'),
      makeNode('brother'),
      makeNode('nephew'),
    ];
    const edges = [
      makeGeneticEdge('father', 'affectedMale'),
      makeGeneticEdge('father', 'brother'),
      makeGeneticEdge('brother', 'nephew'),
    ];
    const resolveSex = sexResolver({
      father: 'male',
      affectedMale: 'male',
      brother: 'male',
      nephew: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedMale']);
    const result = computeYLinked(graph, affected, resolveSex);

    it("marks the affected male's brother as obligateAffected (shared paternal Y)", () => {
      expect(status(result, 'brother')).toBe('obligateAffected');
    });

    it("marks the brother's son (nephew) as obligateAffected (re-descent of the Y)", () => {
      expect(status(result, 'nephew')).toBe('obligateAffected');
    });
  });

  describe("an affected male's paternal uncle and cousin (collateral male line)", () => {
    /**
     *   grandfather (male)
     *        |            |
     *     father       uncle (male)   <- grandfather's other son, same Y ->
     *    (male)            |             obligateAffected
     *        |          cousin (male)  <- uncle's son, same Y -> obligateAffected
     *  affectedMale
     *   (affected)
     *
     *   The paternal uncle carries the grandfather's Y (the same Y the affected
     *   male inherited via his father). The fix re-descends from the grandfather,
     *   so the uncle AND his son (the cousin) are reached.
     */
    const nodes = [
      makeNode('grandfather'),
      makeNode('father'),
      makeNode('affectedMale'),
      makeNode('uncle'),
      makeNode('cousin'),
    ];
    const edges = [
      makeGeneticEdge('grandfather', 'father'),
      makeGeneticEdge('grandfather', 'uncle'),
      makeGeneticEdge('father', 'affectedMale'),
      makeGeneticEdge('uncle', 'cousin'),
    ];
    const resolveSex = sexResolver({
      grandfather: 'male',
      father: 'male',
      affectedMale: 'male',
      uncle: 'male',
      cousin: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedMale']);
    const result = computeYLinked(graph, affected, resolveSex);

    it("marks the paternal uncle (grandfather's other son) as obligateAffected", () => {
      expect(status(result, 'uncle')).toBe('obligateAffected');
    });

    it("marks the uncle's son (male-line cousin) as obligateAffected", () => {
      expect(status(result, 'cousin')).toBe('obligateAffected');
    });
  });

  describe('a married-in male (not male-line connected) gets nothing', () => {
    /**
     *   affectedMale (affected)    spouseOfDaughter (male, married in)
     *        |                            |
     *    daughter (female) ---------------+
     *        |
     *  grandchild (male)
     *
     *   The daughter's husband married into the pedigree; he is reachable only
     *   through the daughter (a female bridge), never through a male child or male
     *   parent of the affected male. He is NOT in the male-line component, so he
     *   gets nothing.
     */
    const nodes = [
      makeNode('affectedMale'),
      makeNode('daughter'),
      makeNode('spouseOfDaughter'),
      makeNode('grandchild'),
    ];
    const edges = [
      makeGeneticEdge('affectedMale', 'daughter'),
      makeGeneticEdge('daughter', 'grandchild'),
      makeGeneticEdge('spouseOfDaughter', 'grandchild'),
    ];
    const resolveSex = sexResolver({
      affectedMale: 'male',
      daughter: 'female',
      spouseOfDaughter: 'male',
      grandchild: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedMale']);
    const result = computeYLinked(graph, affected, resolveSex);

    it('confers nothing on the married-in male (no male-line connection)', () => {
      expect(status(result, 'spouseOfDaughter')).toBe('unknown');
    });

    it("confers nothing on the daughter's son (reached only via a female)", () => {
      expect(status(result, 'grandchild')).toBe('unknown');
    });

    it('confers nothing on the daughter', () => {
      expect(status(result, 'daughter')).toBe('unknown');
    });
  });

  describe('no transmission through a female', () => {
    /**
     *   affectedMale (affected)
     *        |
     *    daughter (female)   <- no Y -> nothing
     *        |
     *   grandsonViaDaughter (male)   <- Y came from daughter's husband, not the
     *                                   affected male -> nothing
     */
    const nodes = [
      makeNode('affectedMale'),
      makeNode('daughter'),
      makeNode('grandsonViaDaughter'),
    ];
    const edges = [
      makeGeneticEdge('affectedMale', 'daughter'),
      makeGeneticEdge('daughter', 'grandsonViaDaughter'),
    ];
    const resolveSex = sexResolver({
      affectedMale: 'male',
      daughter: 'female',
      grandsonViaDaughter: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedMale']);
    const result = computeYLinked(graph, affected, resolveSex);

    it('confers nothing on the daughter', () => {
      expect(status(result, 'daughter')).toBe('unknown');
    });

    it("confers nothing on the daughter's son (the Y line never passes through a female)", () => {
      expect(status(result, 'grandsonViaDaughter')).toBe('unknown');
    });
  });

  describe('a female anywhere gets nothing', () => {
    /**
     *   affectedFemale (affected)   <- Y-linked disease cannot present in a
     *        |                         female under this model; she has no Y to
     *      son (male)                  pass. Females have no risk, no transmission.
     */
    const nodes = [makeNode('affectedFemale'), makeNode('son')];
    const edges = [makeGeneticEdge('affectedFemale', 'son')];
    const resolveSex = sexResolver({
      affectedFemale: 'female',
      son: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedFemale']);
    const result = computeYLinked(graph, affected, resolveSex);

    it('keeps the nominated female affected (boolean nomination is preserved)', () => {
      expect(status(result, 'affectedFemale')).toBe('affected');
    });

    it('confers nothing via a female (no Y transmission)', () => {
      expect(status(result, 'son')).toBe('unknown');
    });
  });

  describe('consanguinity-loop termination', () => {
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
    const edges = [
      makeGeneticEdge('A', 'B'),
      makeGeneticEdge('B', 'C'),
      makeGeneticEdge('C', 'A'),
    ];
    const resolveSex = sexResolver({ A: 'male', B: 'male', C: 'male' });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['A']);

    it('terminates without throwing on a cyclic all-male pedigree', () => {
      expect(() => computeYLinked(graph, affected, resolveSex)).not.toThrow();
    });
  });
});

describe('computeMitochondrial', () => {
  describe('every child of an affected female is atRiskAffected', () => {
    /**
     *   affectedFemale (affected) --- husband (male)
     *        |          |
     *    daughter      son
     *   (female)      (male)
     *
     *   mtDNA is maternally inherited; every child of an affected female receives
     *   her mitochondria. Heteroplasmy -> variable penetrance -> atRiskAffected
     *   (NOT upgraded to affected).
     */
    const nodes = [
      makeNode('affectedFemale'),
      makeNode('husband'),
      makeNode('daughter'),
      makeNode('son'),
    ];
    const edges = [
      makeGeneticEdge('affectedFemale', 'daughter'),
      makeGeneticEdge('husband', 'daughter'),
      makeGeneticEdge('affectedFemale', 'son'),
      makeGeneticEdge('husband', 'son'),
    ];
    const resolveSex = sexResolver({
      affectedFemale: 'female',
      husband: 'male',
      daughter: 'female',
      son: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedFemale']);
    const result = computeMitochondrial(graph, affected, resolveSex);

    it('marks the affected female as affected', () => {
      expect(status(result, 'affectedFemale')).toBe('affected');
    });

    it('marks every child (both sexes) of an affected female as atRiskAffected', () => {
      expect(status(result, 'daughter')).toBe('atRiskAffected');
      expect(status(result, 'son')).toBe('atRiskAffected');
    });
  });

  describe('recursion continues down daughters (through unaffected daughters)', () => {
    /**
     *   affectedFemale (affected)
     *        |
     *    daughter (female, clinically unaffected, atRiskAffected)
     *        |          |
     *  grandDaughter   grandSon
     *   (female)       (male)
     *
     *   A daughter transmits mtDNA even if clinically unaffected; her children
     *   are at risk too. Recursion continues DOWN through daughters.
     */
    const nodes = [
      makeNode('affectedFemale'),
      makeNode('daughter'),
      makeNode('grandDaughter'),
      makeNode('grandSon'),
    ];
    const edges = [
      makeGeneticEdge('affectedFemale', 'daughter'),
      makeGeneticEdge('daughter', 'grandDaughter'),
      makeGeneticEdge('daughter', 'grandSon'),
    ];
    const resolveSex = sexResolver({
      affectedFemale: 'female',
      daughter: 'female',
      grandDaughter: 'female',
      grandSon: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedFemale']);
    const result = computeMitochondrial(graph, affected, resolveSex);

    it('marks the daughter as atRiskAffected', () => {
      expect(status(result, 'daughter')).toBe('atRiskAffected');
    });

    it("marks the daughter's children (both sexes) as atRiskAffected", () => {
      expect(status(result, 'grandDaughter')).toBe('atRiskAffected');
      expect(status(result, 'grandSon')).toBe('atRiskAffected');
    });
  });

  describe('recursion stops at every male (a male does not transmit mtDNA)', () => {
    /**
     *   affectedFemale (affected)
     *        |
     *      son (male, atRiskAffected)
     *        |          |
     *  grandViaSonF   grandViaSonM
     *   (female)       (male)
     *
     *   The son receives the mtDNA (atRiskAffected) but cannot transmit it; HIS
     *   children get nothing. Recursion stops at the male.
     */
    const nodes = [
      makeNode('affectedFemale'),
      makeNode('son'),
      makeNode('grandViaSonF'),
      makeNode('grandViaSonM'),
    ];
    const edges = [
      makeGeneticEdge('affectedFemale', 'son'),
      makeGeneticEdge('son', 'grandViaSonF'),
      makeGeneticEdge('son', 'grandViaSonM'),
    ];
    const resolveSex = sexResolver({
      affectedFemale: 'female',
      son: 'male',
      grandViaSonF: 'female',
      grandViaSonM: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedFemale']);
    const result = computeMitochondrial(graph, affected, resolveSex);

    it('marks the son as atRiskAffected', () => {
      expect(status(result, 'son')).toBe('atRiskAffected');
    });

    it("confers nothing on the son's children (recursion stops at the male)", () => {
      expect(status(result, 'grandViaSonF')).toBe('unknown');
      expect(status(result, 'grandViaSonM')).toBe('unknown');
    });
  });

  describe("an affected male's children get nothing (males do not transmit mtDNA)", () => {
    /**
     *   affectedMale (affected) --- wife (female)
     *        |          |
     *    daughter      son
     *
     *   A male's mtDNA is not passed to his children; they get nothing FROM him.
     */
    const nodes = [
      makeNode('affectedMale'),
      makeNode('wife'),
      makeNode('daughter'),
      makeNode('son'),
    ];
    const edges = [
      makeGeneticEdge('affectedMale', 'daughter'),
      makeGeneticEdge('wife', 'daughter'),
      makeGeneticEdge('affectedMale', 'son'),
      makeGeneticEdge('wife', 'son'),
    ];
    const resolveSex = sexResolver({
      affectedMale: 'male',
      wife: 'female',
      daughter: 'female',
      son: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedMale']);
    const result = computeMitochondrial(graph, affected, resolveSex);

    it('keeps the nominated affected male affected', () => {
      expect(status(result, 'affectedMale')).toBe('affected');
    });

    it("confers nothing on the affected male's children", () => {
      expect(status(result, 'daughter')).toBe('unknown');
      expect(status(result, 'son')).toBe('unknown');
    });
  });

  describe('up the maternal line: an affected person seeds the maternal source and her daughter-descent', () => {
    /**
     *   maternalGrandmother (female)
     *        |              |
     *     mother         maternalAunt
     *    (female)        (female)
     *        |
     *   affectedChild (affected)
     *
     *   The affected child's mtDNA came from her mother, who got it from the
     *   maternal grandmother (the mt source). The grandmother's whole maternal
     *   line is at risk: the mother and the maternal aunt (the grandmother's
     *   other daughter) and everyone reached via daughters.
     */
    const nodes = [
      makeNode('maternalGrandmother'),
      makeNode('mother'),
      makeNode('maternalAunt'),
      makeNode('affectedChild'),
    ];
    const edges = [
      makeGeneticEdge('maternalGrandmother', 'mother'),
      makeGeneticEdge('maternalGrandmother', 'maternalAunt'),
      makeGeneticEdge('mother', 'affectedChild'),
    ];
    const resolveSex = sexResolver({
      maternalGrandmother: 'female',
      mother: 'female',
      maternalAunt: 'female',
      affectedChild: 'female',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedChild']);
    const result = computeMitochondrial(graph, affected, resolveSex);

    it('marks the mother (maternal line) as atRiskAffected', () => {
      expect(status(result, 'mother')).toBe('atRiskAffected');
    });

    it('marks the maternal grandmother (mt source) as atRiskAffected', () => {
      expect(status(result, 'maternalGrandmother')).toBe('atRiskAffected');
    });

    it("marks the maternal aunt (grandmother's other daughter) as atRiskAffected", () => {
      expect(status(result, 'maternalAunt')).toBe('atRiskAffected');
    });
  });

  describe('maternal line stops at a male ancestor', () => {
    /**
     *   father (male)   <- the affected child's FATHER is not the mt source
     *        |
     *   affectedChild (affected)
     *
     *   mtDNA is maternal; the father's line is irrelevant. The father gets
     *   nothing.
     */
    const nodes = [makeNode('father'), makeNode('affectedChild')];
    const edges = [makeGeneticEdge('father', 'affectedChild')];
    const resolveSex = sexResolver({
      father: 'male',
      affectedChild: 'female',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedChild']);
    const result = computeMitochondrial(graph, affected, resolveSex);

    it('confers nothing on the father (paternal ancestor, not the mt source)', () => {
      expect(status(result, 'father')).toBe('unknown');
    });
  });

  describe('consanguinity-loop termination', () => {
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
    const edges = [
      makeGeneticEdge('A', 'B'),
      makeGeneticEdge('B', 'C'),
      makeGeneticEdge('C', 'A'),
    ];
    const resolveSex = sexResolver({ A: 'female', B: 'female', C: 'female' });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['A']);

    it('terminates without throwing on a cyclic all-female pedigree', () => {
      expect(() =>
        computeMitochondrial(graph, affected, resolveSex),
      ).not.toThrow();
    });
  });
});
