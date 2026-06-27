import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { buildGeneticGraph, type GeneticGraph } from '../geneticGraph';
import {
  computeXLinkedDominant,
  computeXLinkedRecessive,
} from '../patterns/xLinked';
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

describe('computeXLinkedRecessive', () => {
  describe('obligate: every daughter of an affected male', () => {
    /**
     *   affectedMale (affected)  --- wife (female)
     *        |          |              |
     *    daughter1   daughter2       son (male)
     *    (female)    (female)
     *
     *   An affected male passes his single X to ALL daughters -> obligateCarrier.
     *   His son receives the Y -> nothing from him (no male-to-male transmission).
     */
    const nodes = [
      makeNode('affectedMale'),
      makeNode('wife'),
      makeNode('daughter1'),
      makeNode('daughter2'),
      makeNode('son'),
    ];
    const edges = [
      makeGeneticEdge('affectedMale', 'daughter1'),
      makeGeneticEdge('wife', 'daughter1'),
      makeGeneticEdge('affectedMale', 'daughter2'),
      makeGeneticEdge('wife', 'daughter2'),
      makeGeneticEdge('affectedMale', 'son'),
      makeGeneticEdge('wife', 'son'),
    ];
    const resolveSex = sexResolver({
      affectedMale: 'male',
      wife: 'female',
      daughter1: 'female',
      daughter2: 'female',
      son: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedMale']);
    const result = computeXLinkedRecessive(graph, affected, resolveSex);

    it('marks the affected male as affected', () => {
      expect(status(result, 'affectedMale')).toBe('affected');
    });

    it('marks EVERY daughter of the affected male as obligateCarrier', () => {
      expect(status(result, 'daughter1')).toBe('obligateCarrier');
      expect(status(result, 'daughter2')).toBe('obligateCarrier');
    });

    it('does NOT transmit to the son (no male-to-male transmission)', () => {
      expect(status(result, 'son')).toBe('unknown');
    });
  });

  describe('obligate: a female with two affected sons', () => {
    /**
     *   mother (female)
     *      |        |
     *   son1      son2
     *  (affected) (affected)
     *
     *   Two affected sons make the mother an obligate carrier.
     */
    const nodes = [makeNode('mother'), makeNode('son1'), makeNode('son2')];
    const edges = [
      makeGeneticEdge('mother', 'son1'),
      makeGeneticEdge('mother', 'son2'),
    ];
    const resolveSex = sexResolver({
      mother: 'female',
      son1: 'male',
      son2: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['son1', 'son2']);
    const result = computeXLinkedRecessive(graph, affected, resolveSex);

    it('marks the mother of two affected sons as obligateCarrier', () => {
      expect(status(result, 'mother')).toBe('obligateCarrier');
    });
  });

  describe('obligate: a female with an affected son AND an affected maternal-line male', () => {
    /**
     *   grandmother (female)
     *        |            |
     *     mother       uncle (affected, mother's brother)
     *    (female)
     *        |
     *      son (affected)
     *
     *   `mother` has an affected son AND an affected maternal-line male (her
     *   brother `uncle`), so she is an obligate carrier (not merely at-risk).
     */
    const nodes = [
      makeNode('grandmother'),
      makeNode('mother'),
      makeNode('uncle'),
      makeNode('son'),
    ];
    const edges = [
      makeGeneticEdge('grandmother', 'mother'),
      makeGeneticEdge('grandmother', 'uncle'),
      makeGeneticEdge('mother', 'son'),
    ];
    const resolveSex = sexResolver({
      grandmother: 'female',
      mother: 'female',
      uncle: 'male',
      son: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['son', 'uncle']);
    const result = computeXLinkedRecessive(graph, affected, resolveSex);

    it('marks the mother (affected son + affected maternal-line male) as obligateCarrier', () => {
      expect(status(result, 'mother')).toBe('obligateCarrier');
    });
  });

  describe('de novo downgrade: mother of a SINGLE affected male, no other affected male relative', () => {
    /**
     *   mother (female) --- father (male)
     *               \      /
     *              son (affected)   <- the ONLY affected male, no other affected relative
     *
     *   De novo is not excluded, so the mother is atRiskCarrier, NOT obligate.
     */
    const nodes = [makeNode('mother'), makeNode('father'), makeNode('son')];
    const edges = [
      makeGeneticEdge('mother', 'son'),
      makeGeneticEdge('father', 'son'),
    ];
    const resolveSex = sexResolver({
      mother: 'female',
      father: 'male',
      son: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['son']);
    const result = computeXLinkedRecessive(graph, affected, resolveSex);

    it('marks the mother of a single affected male as atRiskCarrier (NOT obligateCarrier)', () => {
      expect(status(result, 'mother')).toBe('atRiskCarrier');
      expect(status(result, 'mother')).not.toBe('obligateCarrier');
    });
  });

  describe("refutation B: affected PATERNAL-line male up the mother's male line does NOT make her obligate", () => {
    /**
     *   affPGF (affected MALE)
     *      |
     *   mGrandfather (unaffected MALE)   <- the mother's FATHER
     *      |
     *   mother (female)
     *      |
     *    son (affected)
     *
     *   affPGF reaches the mother only through an unbroken MALE line, so he
     *   shares NO X with her. With a single affected son and no affected
     *   maternal sibling, the mother is `atRiskCarrier`, NOT obligate.
     */
    const nodes = [
      makeNode('affPGF'),
      makeNode('mGrandfather'),
      makeNode('mother'),
      makeNode('son'),
    ];
    const edges = [
      makeGeneticEdge('affPGF', 'mGrandfather'),
      makeGeneticEdge('mGrandfather', 'mother'),
      makeGeneticEdge('mother', 'son'),
    ];
    const resolveSex = sexResolver({
      affPGF: 'male',
      mGrandfather: 'male',
      mother: 'female',
      son: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affPGF', 'son']);
    const result = computeXLinkedRecessive(graph, affected, resolveSex);

    it('marks the mother as atRiskCarrier (NOT obligateCarrier)', () => {
      expect(status(result, 'mother')).toBe('atRiskCarrier');
      expect(status(result, 'mother')).not.toBe('obligateCarrier');
    });
  });

  describe('refutation C: an affected male-line GREAT-grandfather does NOT make the mother obligate', () => {
    /**
     *   affMGGF (affected MALE, great-grandfather)
     *      |
     *   mGrandfather (unaffected MALE)
     *      |
     *   mother (female)
     *      |
     *    son (affected)
     *
     *   Same shape as B, one generation deeper: the affected male is reached
     *   through an unbroken male line, shares no X with the mother → she stays
     *   `atRiskCarrier`.
     */
    const nodes = [
      makeNode('affMGGF'),
      makeNode('mGrandfather'),
      makeNode('mother'),
      makeNode('son'),
    ];
    const edges = [
      makeGeneticEdge('affMGGF', 'mGrandfather'),
      makeGeneticEdge('mGrandfather', 'mother'),
      makeGeneticEdge('mother', 'son'),
    ];
    const resolveSex = sexResolver({
      affMGGF: 'male',
      mGrandfather: 'male',
      mother: 'female',
      son: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affMGGF', 'son']);
    const result = computeXLinkedRecessive(graph, affected, resolveSex);

    it('marks the mother as atRiskCarrier (NOT obligateCarrier)', () => {
      expect(status(result, 'mother')).toBe('atRiskCarrier');
      expect(status(result, 'mother')).not.toBe('obligateCarrier');
    });
  });

  describe('refutation H: an affected MATERNAL GRANDFATHER (50%-transmitting X-ancestor) does NOT make the mother obligate', () => {
    /**
     *   affMGF (affected MALE, maternal grandfather)
     *      |
     *   grandmother (female)   <- daughter of affMGF -> obligateCarrier
     *      |
     *   mother (female)
     *      |
     *    son (affected)
     *
     *   affMGF's X went OBLIGATELY to the grandmother, but to the MOTHER only
     *   with 50%. A single affected son therefore leaves the mother
     *   `atRiskCarrier`, NOT obligate. The grandmother stays `obligateCarrier`
     *   (daughter of an affected male — unchanged by this fix).
     */
    const nodes = [
      makeNode('affMGF'),
      makeNode('grandmother'),
      makeNode('mother'),
      makeNode('son'),
    ];
    const edges = [
      makeGeneticEdge('affMGF', 'grandmother'),
      makeGeneticEdge('grandmother', 'mother'),
      makeGeneticEdge('mother', 'son'),
    ];
    const resolveSex = sexResolver({
      affMGF: 'male',
      grandmother: 'female',
      mother: 'female',
      son: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affMGF', 'son']);
    const result = computeXLinkedRecessive(graph, affected, resolveSex);

    it('marks the mother as atRiskCarrier (NOT obligateCarrier)', () => {
      expect(status(result, 'mother')).toBe('atRiskCarrier');
      expect(status(result, 'mother')).not.toBe('obligateCarrier');
    });

    it('keeps the grandmother (daughter of the affected male) as obligateCarrier', () => {
      expect(status(result, 'grandmother')).toBe('obligateCarrier');
    });
  });

  describe('daughter of an affected male stays obligateCarrier (regression guard)', () => {
    /**
     *   affectedFather (affected MALE)
     *      |
     *   daughter (female)   <- his X reaches ALL daughters -> obligateCarrier
     */
    const nodes = [makeNode('affectedFather'), makeNode('daughter')];
    const edges = [makeGeneticEdge('affectedFather', 'daughter')];
    const resolveSex = sexResolver({
      affectedFather: 'male',
      daughter: 'female',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedFather']);
    const result = computeXLinkedRecessive(graph, affected, resolveSex);

    it('marks the daughter of an affected male as obligateCarrier', () => {
      expect(status(result, 'daughter')).toBe('obligateCarrier');
    });
  });

  describe('maternal line of an affected male', () => {
    /**
     *   grandmother (female) --- grandfather (male)
     *        |           |              |
     *     mother      maternalAunt   maternalUncle
     *    (female,     (female)       (male)
     *     obligate)
     *        |
     *      son (affected)
     *
     *   With an obligate-carrier mother (≥2 affected sons branch is not used here;
     *   she is obligate via... actually single son -> atRiskCarrier). To exercise
     *   the maternal-line spread we make her obligate by adding a 2nd affected son.
     */
    const nodes = [
      makeNode('grandmother'),
      makeNode('grandfather'),
      makeNode('mother'),
      makeNode('maternalAunt'),
      makeNode('maternalUncle'),
      makeNode('son'),
      makeNode('son2'),
    ];
    const edges = [
      makeGeneticEdge('grandmother', 'mother'),
      makeGeneticEdge('grandfather', 'mother'),
      makeGeneticEdge('grandmother', 'maternalAunt'),
      makeGeneticEdge('grandfather', 'maternalAunt'),
      makeGeneticEdge('grandmother', 'maternalUncle'),
      makeGeneticEdge('grandfather', 'maternalUncle'),
      makeGeneticEdge('mother', 'son'),
      makeGeneticEdge('mother', 'son2'),
    ];
    const resolveSex = sexResolver({
      grandmother: 'female',
      grandfather: 'male',
      mother: 'female',
      maternalAunt: 'female',
      maternalUncle: 'male',
      son: 'male',
      son2: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    // Two affected sons -> mother is obligate; exercises full maternal-line spread.
    const affected = new Set(['son', 'son2']);
    const result = computeXLinkedRecessive(graph, affected, resolveSex);

    it('marks the obligate-carrier mother', () => {
      expect(status(result, 'mother')).toBe('obligateCarrier');
    });

    it('marks the maternal grandmother as atRiskCarrier', () => {
      expect(status(result, 'grandmother')).toBe('atRiskCarrier');
    });

    it('marks the maternal aunt as atRiskCarrier', () => {
      expect(status(result, 'maternalAunt')).toBe('atRiskCarrier');
    });

    it('marks the maternal uncle as atRiskAffected', () => {
      expect(status(result, 'maternalUncle')).toBe('atRiskAffected');
    });

    it('does NOT confer risk to the maternal grandfather (male-line, no X to daughter from... he is the source but unaffected married-in)', () => {
      // The grandfather is a married-in male; XLR confers nothing onto an
      // unaffected married-in male.
      expect(status(result, 'grandfather')).toBe('unknown');
    });
  });

  describe('sons of a carrier female are atRiskAffected; daughters atRiskCarrier', () => {
    /**
     *   carrierMother (obligate via 2 affected sons elsewhere... )
     *   Use daughter-of-affected-male to make her obligate cleanly:
     *
     *   affectedGrandfather (affected male)
     *        |
     *   carrierMother (female -> obligateCarrier, daughter of affected male)
     *        |          |
     *   grandson      granddaughter
     *   (male)        (female)
     *
     *   Sons of the carrier -> atRiskAffected; daughters -> atRiskCarrier.
     */
    const nodes = [
      makeNode('affectedGrandfather'),
      makeNode('carrierMother'),
      makeNode('grandson'),
      makeNode('granddaughter'),
    ];
    const edges = [
      makeGeneticEdge('affectedGrandfather', 'carrierMother'),
      makeGeneticEdge('carrierMother', 'grandson'),
      makeGeneticEdge('carrierMother', 'granddaughter'),
    ];
    const resolveSex = sexResolver({
      affectedGrandfather: 'male',
      carrierMother: 'female',
      grandson: 'male',
      granddaughter: 'female',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedGrandfather']);
    const result = computeXLinkedRecessive(graph, affected, resolveSex);

    it('makes the daughter of the affected male an obligateCarrier', () => {
      expect(status(result, 'carrierMother')).toBe('obligateCarrier');
    });

    it('marks a son of a carrier female as atRiskAffected', () => {
      expect(status(result, 'grandson')).toBe('atRiskAffected');
    });

    it('marks a daughter of a carrier female as atRiskCarrier', () => {
      expect(status(result, 'granddaughter')).toBe('atRiskCarrier');
    });
  });

  describe('no male-to-male transmission: an affected male confers nothing to his sons', () => {
    /**
     *   affectedMale (affected)
     *        |
     *      son (male)   <- gets the Y, NOT the X -> nothing
     *        |
     *    grandson (male)
     */
    const nodes = [
      makeNode('affectedMale'),
      makeNode('son'),
      makeNode('grandson'),
    ];
    const edges = [
      makeGeneticEdge('affectedMale', 'son'),
      makeGeneticEdge('son', 'grandson'),
    ];
    const resolveSex = sexResolver({
      affectedMale: 'male',
      son: 'male',
      grandson: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedMale']);
    const result = computeXLinkedRecessive(graph, affected, resolveSex);

    it('confers nothing on the son of an affected male', () => {
      expect(status(result, 'son')).toBe('unknown');
    });

    it('confers nothing on the grandson via the male line', () => {
      expect(status(result, 'grandson')).toBe('unknown');
    });
  });

  describe('sex-blocked: a leaf with unknown sex', () => {
    /**
     *   affectedMale (affected) --- wife (female)
     *               \             /
     *              child (UNKNOWN sex)
     *
     *   The child's sex is unknown, so the sex-dependent daughter rule cannot be
     *   applied -> unknown (sex-blocked), not obligateCarrier.
     */
    const nodes = [
      makeNode('affectedMale'),
      makeNode('wife'),
      makeNode('child'),
    ];
    const edges = [
      makeGeneticEdge('affectedMale', 'child'),
      makeGeneticEdge('wife', 'child'),
    ];
    const resolveSex = sexResolver({
      affectedMale: 'male',
      wife: 'female',
      // child intentionally omitted -> 'unknown'
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedMale']);
    const result = computeXLinkedRecessive(graph, affected, resolveSex);

    it('leaves a leaf of unknown sex as unknown (sex-blocked)', () => {
      expect(status(result, 'child')).toBe('unknown');
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

    it('terminates without throwing on a cyclic pedigree', () => {
      expect(() =>
        computeXLinkedRecessive(graph, affected, resolveSex),
      ).not.toThrow();
    });
  });
});

describe('computeXLinkedDominant', () => {
  describe('every daughter of an affected male is obligateAffected; sons get nothing', () => {
    /**
     *   affectedMale (affected) --- wife (female)
     *        |          |              |
     *    daughter1   daughter2       son (male)
     *    (female)    (female)
     *
     *   An affected male transmits his X to ALL daughters; in XLD one copy
     *   suffices -> obligateAffected. His sons receive the Y -> nothing from him.
     */
    const nodes = [
      makeNode('affectedMale'),
      makeNode('wife'),
      makeNode('daughter1'),
      makeNode('daughter2'),
      makeNode('son'),
    ];
    const edges = [
      makeGeneticEdge('affectedMale', 'daughter1'),
      makeGeneticEdge('wife', 'daughter1'),
      makeGeneticEdge('affectedMale', 'daughter2'),
      makeGeneticEdge('wife', 'daughter2'),
      makeGeneticEdge('affectedMale', 'son'),
      makeGeneticEdge('wife', 'son'),
    ];
    const resolveSex = sexResolver({
      affectedMale: 'male',
      wife: 'female',
      daughter1: 'female',
      daughter2: 'female',
      son: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedMale']);
    const result = computeXLinkedDominant(graph, affected, resolveSex);

    it('marks the affected male as affected', () => {
      expect(status(result, 'affectedMale')).toBe('affected');
    });

    it('marks EVERY daughter of the affected male as obligateAffected', () => {
      expect(status(result, 'daughter1')).toBe('obligateAffected');
      expect(status(result, 'daughter2')).toBe('obligateAffected');
    });

    it('confers nothing on the son of the affected male', () => {
      expect(status(result, 'son')).toBe('unknown');
    });
  });

  describe('each child of an affected female is atRiskAffected', () => {
    /**
     *   affectedFemale (affected) --- husband (male)
     *        |          |
     *    daughter      son
     *   (female)      (male)
     *
     *   An affected female passes the affected X to ~50% -> each child is
     *   atRiskAffected (both sons and daughters).
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
    const result = computeXLinkedDominant(graph, affected, resolveSex);

    it('marks each child of the affected female as atRiskAffected', () => {
      expect(status(result, 'daughter')).toBe('atRiskAffected');
      expect(status(result, 'son')).toBe('atRiskAffected');
    });
  });

  describe('recursion through affected descendants', () => {
    /**
     *   affectedMale (affected)
     *        |
     *    daughter (obligateAffected, daughter of affected male)
     *        |
     *   grandchild (atRiskAffected, child of an affected daughter)
     */
    const nodes = [
      makeNode('affectedMale'),
      makeNode('daughter'),
      makeNode('grandchild'),
    ];
    const edges = [
      makeGeneticEdge('affectedMale', 'daughter'),
      makeGeneticEdge('daughter', 'grandchild'),
    ];
    const resolveSex = sexResolver({
      affectedMale: 'male',
      daughter: 'female',
      grandchild: 'female',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedMale']);
    const result = computeXLinkedDominant(graph, affected, resolveSex);

    it('marks the daughter of the affected male as obligateAffected', () => {
      expect(status(result, 'daughter')).toBe('obligateAffected');
    });

    it('propagates atRiskAffected to the child of the (obligately) affected daughter', () => {
      expect(status(result, 'grandchild')).toBe('atRiskAffected');
    });
  });

  describe('sex-blocked: child of unknown sex', () => {
    /**
     *   affectedMale (affected) --- wife (female)
     *               \             /
     *              child (UNKNOWN sex)
     */
    const nodes = [
      makeNode('affectedMale'),
      makeNode('wife'),
      makeNode('child'),
    ];
    const edges = [
      makeGeneticEdge('affectedMale', 'child'),
      makeGeneticEdge('wife', 'child'),
    ];
    const resolveSex = sexResolver({
      affectedMale: 'male',
      wife: 'female',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['affectedMale']);
    const result = computeXLinkedDominant(graph, affected, resolveSex);

    it('leaves a child of unknown sex unknown (sex-blocked)', () => {
      expect(status(result, 'child')).toBe('unknown');
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

    it('terminates without throwing on a cyclic pedigree', () => {
      expect(() =>
        computeXLinkedDominant(graph, affected, resolveSex),
      ).not.toThrow();
    });
  });
});
