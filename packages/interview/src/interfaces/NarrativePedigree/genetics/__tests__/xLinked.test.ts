import { describe, expect, it } from 'vitest';

import {
  buildGeneticGraph,
  type GeneticLink,
  type GeneticGraph,
  type GeneticPerson,
} from '../geneticGraph';
import {
  computeXLinkedDominant,
  computeXLinkedRecessive,
} from '../patterns/xLinked';
import type { Status } from '../status';

type Sex = 'female' | 'male' | 'unknown';

function makeNode(id: string): GeneticPerson {
  return { id };
}

function makeGeneticEdge(from: string, to: string): GeneticLink {
  return { source: from, target: to, kind: 'biological' };
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
  nodes: GeneticPerson[],
  edges: GeneticLink[],
  resolveSex: (id: string) => Sex,
): GeneticGraph {
  return buildGeneticGraph({ people: nodes, links: edges }, resolveSex);
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

  describe('an affected MATERNAL GRANDFATHER and an affected son make the mother an obligate carrier (reverses the earlier refutation H)', () => {
    /**
     *   affMGF (affected MALE, maternal grandfather)
     *      |
     *   grandmother (female)   <- daughter of affMGF -> obligateCarrier
     *      |
     *   mother (female)
     *      |
     *    son (affected)
     *
     *   affMGF's X went to the grandmother for certain, and from her to the
     *   mother with a prior of one half. The affected son then leaves only a
     *   coincident new variant as the alternative, so the condition shows on
     *   two sides of the mother and she is `obligateCarrier`.
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

    it('marks the mother and the grandmother obligate carriers', () => {
      expect({
        affMGF: status(result, 'affMGF'),
        grandmother: status(result, 'grandmother'),
        mother: status(result, 'mother'),
        son: status(result, 'son'),
      }).toEqual({
        affMGF: 'affected',
        grandmother: 'obligateCarrier',
        mother: 'obligateCarrier',
        son: 'affected',
      });
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

  describe("maternal collaterals: only the mother's MATERNAL-line siblings share her X", () => {
    /**
     *   grandmother (F) --- grandfather (M) --- otherWoman (F)
     *        |         |            |                |
     *     mother   maternalHalfSib  paternalHalfAunt / paternalHalfUncle
     *    (F)       (F, shares GM)   (share ONLY the grandfather)
     *        |
     *      son (affected)
     *
     *   The mother is atRiskCarrier (single affected son). Her maternal-line
     *   relatives (grandmother, maternal half-sister via the grandmother) are on
     *   the grandmother's X lineage → atRiskCarrier. Her PATERNAL half-siblings
     *   (shared grandfather only) carry none of the grandmother's X → unknown.
     */
    const nodes = [
      makeNode('grandmother'),
      makeNode('grandfather'),
      makeNode('otherWoman'),
      makeNode('mother'),
      makeNode('maternalHalfSib'),
      makeNode('paternalHalfAunt'),
      makeNode('paternalHalfUncle'),
      makeNode('son'),
    ];
    const edges = [
      makeGeneticEdge('grandmother', 'mother'),
      makeGeneticEdge('grandfather', 'mother'),
      // maternal half-sib: shares the grandmother (via a different father)
      makeGeneticEdge('grandmother', 'maternalHalfSib'),
      // paternal half-aunt/uncle: share ONLY the grandfather
      makeGeneticEdge('grandfather', 'paternalHalfAunt'),
      makeGeneticEdge('otherWoman', 'paternalHalfAunt'),
      makeGeneticEdge('grandfather', 'paternalHalfUncle'),
      makeGeneticEdge('otherWoman', 'paternalHalfUncle'),
      makeGeneticEdge('mother', 'son'),
    ];
    const resolveSex = sexResolver({
      grandmother: 'female',
      grandfather: 'male',
      otherWoman: 'female',
      mother: 'female',
      maternalHalfSib: 'female',
      paternalHalfAunt: 'female',
      paternalHalfUncle: 'male',
      son: 'male',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['son']);
    const result = computeXLinkedRecessive(graph, affected, resolveSex);

    it("marks the mother's MATERNAL half-sister as atRiskCarrier", () => {
      expect(status(result, 'maternalHalfSib')).toBe('atRiskCarrier');
    });

    it("does NOT confer risk on the mother's PATERNAL half-aunt (off the X lineage)", () => {
      expect(status(result, 'paternalHalfAunt')).toBe('unknown');
    });

    it("does NOT confer risk on the mother's PATERNAL half-uncle (off the X lineage)", () => {
      expect(status(result, 'paternalHalfUncle')).toBe('unknown');
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
    // An affected male's daughter starts an all-female B → C → D → B loop.
    // Only an affected male passes the X down, and only the female line
    // carries it on, so this is the loop the carrier walk has to escape.
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C'), makeNode('D')];
    const edges = [
      makeGeneticEdge('A', 'B'),
      makeGeneticEdge('B', 'C'),
      makeGeneticEdge('C', 'D'),
      makeGeneticEdge('D', 'B'),
    ];
    const resolveSex = sexResolver({
      A: 'male',
      B: 'female',
      C: 'female',
      D: 'female',
    });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['A']);

    it('terminates on a cyclic pedigree and gives every member of the loop a status', () => {
      const result = computeXLinkedRecessive(graph, affected, resolveSex);
      expect(status(result, 'A')).toBe('affected');
      for (const id of ['B', 'C', 'D']) {
        expect(status(result, id)).not.toBe('unknown');
      }
    });
  });

  describe('a female recorded as affected passes risk to her children', () => {
    /**
     * Runs the engine over a pedigree given as `[parent, child]` pairs and
     * returns the status of EVERY person, so a test asserts the whole family:
     * a status that appears where none is expected fails as surely as one that
     * is missing.
     */
    function statusesOf(
      people: Record<string, Sex>,
      links: [string, string][],
      affected: string[],
    ): Record<string, Status> {
      const resolveSex = sexResolver(people);
      const graph = buildGraph(
        Object.keys(people).map(makeNode),
        links.map(([parent, child]) => makeGeneticEdge(parent, child)),
        resolveSex,
      );
      const result = computeXLinkedRecessive(
        graph,
        new Set(affected),
        resolveSex,
      );
      return Object.fromEntries(
        Object.keys(people).map((id) => [id, status(result, id)]),
      );
    }

    it('marks the son and daughter of a lone affected woman at risk', () => {
      /**
       *   woman (affected) --- partner
       *            |     |
       *          son    daughter
       */
      expect(
        statusesOf(
          {
            woman: 'female',
            partner: 'male',
            son: 'male',
            daughter: 'female',
          },
          [
            ['woman', 'son'],
            ['partner', 'son'],
            ['woman', 'daughter'],
            ['partner', 'daughter'],
          ],
          ['woman'],
        ),
      ).toEqual({
        woman: 'affected',
        partner: 'unknown',
        son: 'atRiskAffected',
        daughter: 'atRiskCarrier',
      });
    });

    it('infers nothing about the parents or siblings of an affected woman', () => {
      /**
       *            mother --- father
       *       |          |           |
       *   brother     sister    woman (affected) --- partner
       *                               |
       *                              son
       */
      expect(
        statusesOf(
          {
            mother: 'female',
            father: 'male',
            brother: 'male',
            sister: 'female',
            woman: 'female',
            partner: 'male',
            son: 'male',
          },
          [
            ['mother', 'woman'],
            ['father', 'woman'],
            ['mother', 'brother'],
            ['father', 'brother'],
            ['mother', 'sister'],
            ['father', 'sister'],
            ['woman', 'son'],
            ['partner', 'son'],
          ],
          ['woman'],
        ),
      ).toEqual({
        mother: 'unknown',
        father: 'unknown',
        brother: 'unknown',
        sister: 'unknown',
        woman: 'affected',
        partner: 'unknown',
        son: 'atRiskAffected',
      });
    });

    it("treats an affected father's affected daughter's children like her carrier sister's", () => {
      /**
       *        father (affected) --- mother
       *          |                     |
       *   affectedDaughter --- p1   unaffectedDaughter --- p2
       *      |         |                     |
       *   grandson  granddaughter         nephew
       */
      expect(
        statusesOf(
          {
            father: 'male',
            mother: 'female',
            affectedDaughter: 'female',
            unaffectedDaughter: 'female',
            p1: 'male',
            p2: 'male',
            grandson: 'male',
            granddaughter: 'female',
            nephew: 'male',
          },
          [
            ['father', 'affectedDaughter'],
            ['mother', 'affectedDaughter'],
            ['father', 'unaffectedDaughter'],
            ['mother', 'unaffectedDaughter'],
            ['affectedDaughter', 'grandson'],
            ['p1', 'grandson'],
            ['affectedDaughter', 'granddaughter'],
            ['p1', 'granddaughter'],
            ['unaffectedDaughter', 'nephew'],
            ['p2', 'nephew'],
          ],
          ['father', 'affectedDaughter'],
        ),
      ).toEqual({
        father: 'affected',
        mother: 'unknown',
        affectedDaughter: 'affected',
        unaffectedDaughter: 'obligateCarrier',
        p1: 'unknown',
        p2: 'unknown',
        grandson: 'atRiskAffected',
        granddaughter: 'atRiskCarrier',
        nephew: 'atRiskAffected',
      });
    });

    it('gives the same children the same statuses when the affected woman has a carrier mother', () => {
      /**
       *            mother --- father
       *       |        |          |
       *     son1     son2     affectedDaughter --- p
       *  (affected) (affected)       |        |
       *                           grandson  granddaughter
       */
      expect(
        statusesOf(
          {
            mother: 'female',
            father: 'male',
            son1: 'male',
            son2: 'male',
            affectedDaughter: 'female',
            p: 'male',
            grandson: 'male',
            granddaughter: 'female',
          },
          [
            ['mother', 'son1'],
            ['father', 'son1'],
            ['mother', 'son2'],
            ['father', 'son2'],
            ['mother', 'affectedDaughter'],
            ['father', 'affectedDaughter'],
            ['affectedDaughter', 'grandson'],
            ['p', 'grandson'],
            ['affectedDaughter', 'granddaughter'],
            ['p', 'granddaughter'],
          ],
          ['son1', 'son2', 'affectedDaughter'],
        ),
      ).toEqual({
        mother: 'obligateCarrier',
        father: 'unknown',
        son1: 'affected',
        son2: 'affected',
        affectedDaughter: 'affected',
        p: 'unknown',
        grandson: 'atRiskAffected',
        granddaughter: 'atRiskCarrier',
      });
    });

    it("continues down through an affected woman's daughters", () => {
      /**
       *   woman (affected) --- partner
       *            |
       *        daughter --- daughterPartner
       *         |       |
       *     grandson  granddaughter
       */
      expect(
        statusesOf(
          {
            woman: 'female',
            partner: 'male',
            daughter: 'female',
            daughterPartner: 'male',
            grandson: 'male',
            granddaughter: 'female',
          },
          [
            ['woman', 'daughter'],
            ['partner', 'daughter'],
            ['daughter', 'grandson'],
            ['daughterPartner', 'grandson'],
            ['daughter', 'granddaughter'],
            ['daughterPartner', 'granddaughter'],
          ],
          ['woman'],
        ),
      ).toEqual({
        woman: 'affected',
        partner: 'unknown',
        daughter: 'atRiskCarrier',
        daughterPartner: 'unknown',
        grandson: 'atRiskAffected',
        granddaughter: 'atRiskCarrier',
      });
    });

    it('keeps a daughter who also has an affected father an obligate carrier', () => {
      /**
       *   woman (affected) --- husband (affected)
       *            |      |
       *        daughter   son
       */
      expect(
        statusesOf(
          {
            woman: 'female',
            husband: 'male',
            daughter: 'female',
            son: 'male',
          },
          [
            ['woman', 'daughter'],
            ['husband', 'daughter'],
            ['woman', 'son'],
            ['husband', 'son'],
          ],
          ['woman', 'husband'],
        ),
      ).toEqual({
        woman: 'affected',
        husband: 'affected',
        daughter: 'obligateCarrier',
        son: 'atRiskAffected',
      });
    });

    it('keeps affected children affected and the affected woman affected', () => {
      /**
       *          woman (affected) --- partner
       *       |          |          |          |
       *     son1       son2    affectedDaughter  daughter
       *  (affected) (affected)   (affected)
       */
      expect(
        statusesOf(
          {
            woman: 'female',
            partner: 'male',
            son1: 'male',
            son2: 'male',
            affectedDaughter: 'female',
            daughter: 'female',
          },
          [
            ['woman', 'son1'],
            ['partner', 'son1'],
            ['woman', 'son2'],
            ['partner', 'son2'],
            ['woman', 'affectedDaughter'],
            ['partner', 'affectedDaughter'],
            ['woman', 'daughter'],
            ['partner', 'daughter'],
          ],
          ['woman', 'son1', 'son2', 'affectedDaughter'],
        ),
      ).toEqual({
        woman: 'affected',
        partner: 'unknown',
        son1: 'affected',
        son2: 'affected',
        affectedDaughter: 'affected',
        daughter: 'atRiskCarrier',
      });
    });

    it('leaves a child of uncertain sex and their own children unknown', () => {
      /**
       *   woman (affected) --- partner
       *         |         |
       *   child (unknown)  son
       *         |
       *   grandchild (female)
       */
      expect(
        statusesOf(
          {
            woman: 'female',
            partner: 'male',
            child: 'unknown',
            son: 'male',
            grandchild: 'female',
          },
          [
            ['woman', 'child'],
            ['partner', 'child'],
            ['woman', 'son'],
            ['partner', 'son'],
            ['child', 'grandchild'],
          ],
          ['woman'],
        ),
      ).toEqual({
        woman: 'affected',
        partner: 'unknown',
        child: 'unknown',
        son: 'atRiskAffected',
        grandchild: 'unknown',
      });
    });

    it('passes nothing on from an affected person of uncertain sex', () => {
      /**
       *   person (affected, unknown sex) --- partner
       *              |          |
       *             son      daughter
       */
      expect(
        statusesOf(
          {
            person: 'unknown',
            partner: 'male',
            son: 'male',
            daughter: 'female',
          },
          [
            ['person', 'son'],
            ['partner', 'son'],
            ['person', 'daughter'],
            ['partner', 'daughter'],
          ],
          ['person'],
        ),
      ).toEqual({
        person: 'affected',
        partner: 'unknown',
        son: 'unknown',
        daughter: 'unknown',
      });
    });
  });

  describe('obligate: the condition appears on two sides of her', () => {
    type Link = [string, string] | [string, string, string];

    /**
     * Runs the engine over `[parent, child, kind?]` links (kind defaults to
     * `biological`) and returns every person's status.
     */
    function everyStatus(
      people: Record<string, Sex>,
      links: Link[],
      affected: string[],
    ): Record<string, Status> {
      const resolveSex = sexResolver(people);
      const graph = buildGraph(
        Object.keys(people).map(makeNode),
        links.map(([source, target, kind = 'biological']) => ({
          source,
          target,
          kind,
        })),
        resolveSex,
      );
      const result = computeXLinkedRecessive(
        graph,
        new Set(affected),
        resolveSex,
      );
      return Object.fromEntries(
        Object.keys(people).map((id) => [id, status(result, id)]),
      );
    }

    /** Biological links from every parent to every child. */
    function bio(parents: string[], children: string[]): Link[] {
      return parents.flatMap((parent) =>
        children.map((child): Link => [parent, child]),
      );
    }

    describe('an affected son and an affected mother', () => {
      /**
       *        mother (affected) --- father
       *         |        |       |
       *       woman    sister  brother
       *         |  --- partner
       *    son (affected)
       */
      const people: Record<string, Sex> = {
        mother: 'female',
        father: 'male',
        woman: 'female',
        sister: 'female',
        brother: 'male',
        partner: 'male',
        son: 'male',
      };
      const siblings = bio(['mother', 'father'], ['sister', 'brother']);
      const sonLinks = bio(['woman', 'partner'], ['son']);

      it('marks her an obligate carrier and leaves her sister and brother at risk', () => {
        expect(
          everyStatus(
            people,
            [...bio(['mother', 'father'], ['woman']), ...siblings, ...sonLinks],
            ['mother', 'son'],
          ),
        ).toEqual({
          mother: 'affected',
          father: 'unknown',
          woman: 'obligateCarrier',
          sister: 'atRiskCarrier',
          brother: 'atRiskAffected',
          partner: 'unknown',
          son: 'affected',
        });
      });

      it.each(['adoptive', 'social', 'surrogate'])(
        'does not fire when the affected woman is her %s mother',
        (kind) => {
          expect(
            everyStatus(
              people,
              [
                ['mother', 'woman', kind],
                ['father', 'woman'],
                ...siblings,
                ...sonLinks,
              ],
              ['mother', 'son'],
            ),
          ).toEqual({
            mother: 'affected',
            father: 'unknown',
            woman: 'atRiskCarrier',
            sister: 'atRiskCarrier',
            brother: 'atRiskAffected',
            partner: 'unknown',
            son: 'affected',
          });
        },
      );

      it('fires when the affected woman gave the egg she was conceived from', () => {
        /**
         *   eggDonor (affected)   mother (carried her) --- father
         *                  \           |                 /
         *                           woman --- partner
         *                             |
         *                        son (affected)
         */
        expect(
          everyStatus(
            {
              eggDonor: 'female',
              mother: 'female',
              father: 'male',
              woman: 'female',
              partner: 'male',
              son: 'male',
            },
            [
              ['eggDonor', 'woman', 'donor'],
              ['mother', 'woman', 'surrogate'],
              ['father', 'woman'],
              ...sonLinks,
            ],
            ['eggDonor', 'son'],
          ),
        ).toEqual({
          eggDonor: 'affected',
          mother: 'unknown',
          father: 'unknown',
          woman: 'obligateCarrier',
          partner: 'unknown',
          son: 'affected',
        });
      });

      it('does not fire when her affected son was conceived with a donor egg', () => {
        expect(
          everyStatus(
            {
              mother: 'female',
              father: 'male',
              woman: 'female',
              partner: 'male',
              eggDonor: 'female',
              son: 'male',
            },
            [
              ...bio(['mother', 'father'], ['woman']),
              ['woman', 'son', 'social'],
              ['eggDonor', 'son', 'donor'],
              ['partner', 'son'],
            ],
            ['mother', 'son'],
          ),
        ).toEqual({
          mother: 'affected',
          father: 'unknown',
          woman: 'atRiskCarrier',
          partner: 'unknown',
          eggDonor: 'atRiskCarrier',
          son: 'affected',
        });
      });

      it('takes no evidence from an affected parent of uncertain sex', () => {
        expect(
          everyStatus(
            {
              parent: 'unknown',
              father: 'male',
              woman: 'female',
              partner: 'male',
              son: 'male',
            },
            [...bio(['parent', 'father'], ['woman']), ...sonLinks],
            ['parent', 'son'],
          ),
        ).toEqual({
          parent: 'affected',
          father: 'unknown',
          woman: 'atRiskCarrier',
          partner: 'unknown',
          son: 'affected',
        });
      });

      it("gives her other children an obligate carrier's children's statuses", () => {
        expect(
          everyStatus(
            {
              mother: 'female',
              father: 'male',
              woman: 'female',
              partner: 'male',
              son: 'male',
              son2: 'male',
              daughter: 'female',
            },
            [
              ...bio(['mother', 'father'], ['woman']),
              ...bio(['woman', 'partner'], ['son', 'son2', 'daughter']),
            ],
            ['mother', 'son'],
          ),
        ).toEqual({
          mother: 'affected',
          father: 'unknown',
          woman: 'obligateCarrier',
          partner: 'unknown',
          son: 'affected',
          son2: 'atRiskAffected',
          daughter: 'atRiskCarrier',
        });
      });
    });

    describe('an affected daughter and an affected mother', () => {
      /**
       *   mother (affected) --- father
       *               |
       *            woman --- partner (unaffected)
       *               |
       *       daughter (affected)
       */
      it('marks her an obligate carrier', () => {
        expect(
          everyStatus(
            {
              mother: 'female',
              father: 'male',
              woman: 'female',
              partner: 'male',
              daughter: 'female',
            },
            [
              ...bio(['mother', 'father'], ['woman']),
              ...bio(['woman', 'partner'], ['daughter']),
            ],
            ['mother', 'daughter'],
          ),
        ).toEqual({
          mother: 'affected',
          father: 'unknown',
          woman: 'obligateCarrier',
          partner: 'unknown',
          daughter: 'affected',
        });
      });
    });

    describe('an affected son and an affected sister who shares her mother', () => {
      /**
       *          mother --- father
       *         |      |        |
       *      woman  sister    brother
       *        |   (affected)
       *   son (affected)
       */
      it('marks her an obligate carrier and leaves their mother at risk, since both daughters have one father', () => {
        expect(
          everyStatus(
            {
              mother: 'female',
              father: 'male',
              woman: 'female',
              sister: 'female',
              brother: 'male',
              partner: 'male',
              son: 'male',
            },
            [
              ...bio(['mother', 'father'], ['woman', 'sister', 'brother']),
              ...bio(['woman', 'partner'], ['son']),
            ],
            ['sister', 'son'],
          ),
        ).toEqual({
          mother: 'atRiskCarrier',
          father: 'unknown',
          woman: 'obligateCarrier',
          sister: 'affected',
          brother: 'atRiskAffected',
          partner: 'unknown',
          son: 'affected',
        });
      });

      it('marks their mother an obligate carrier too when the sisters have different recorded fathers', () => {
        /**
         *   father --- mother --- sistersFather
         *          |          |
         *        woman     sister (affected)
         *          |
         *     son (affected)
         */
        expect(
          everyStatus(
            {
              mother: 'female',
              father: 'male',
              sistersFather: 'male',
              woman: 'female',
              sister: 'female',
              partner: 'male',
              son: 'male',
            },
            [
              ...bio(['mother', 'father'], ['woman']),
              ...bio(['mother', 'sistersFather'], ['sister']),
              ...bio(['woman', 'partner'], ['son']),
            ],
            ['sister', 'son'],
          ),
        ).toEqual({
          mother: 'obligateCarrier',
          father: 'unknown',
          sistersFather: 'unknown',
          woman: 'obligateCarrier',
          sister: 'affected',
          partner: 'unknown',
          son: 'affected',
        });
      });

      it('takes nothing from an affected sister whose father is not recorded', () => {
        expect(
          everyStatus(
            {
              mother: 'female',
              woman: 'female',
              sister: 'female',
              partner: 'male',
              son: 'male',
            },
            [
              ...bio(['mother'], ['woman', 'sister']),
              ...bio(['woman', 'partner'], ['son']),
            ],
            ['sister', 'son'],
          ),
        ).toEqual({
          mother: 'atRiskCarrier',
          woman: 'atRiskCarrier',
          sister: 'affected',
          partner: 'unknown',
          son: 'affected',
        });
      });

      it('takes nothing from a half-sister whose own father is affected', () => {
        /**
         *   father --- mother --- sistersFather (affected)
         *          |     |              |
         *      woman   brother    sister (affected)
         *        |
         *   son (affected)
         */
        expect(
          everyStatus(
            {
              mother: 'female',
              father: 'male',
              sistersFather: 'male',
              woman: 'female',
              sister: 'female',
              brother: 'male',
              partner: 'male',
              son: 'male',
            },
            [
              ...bio(['mother', 'father'], ['woman', 'brother']),
              ...bio(['mother', 'sistersFather'], ['sister']),
              ...bio(['woman', 'partner'], ['son']),
            ],
            ['sistersFather', 'sister', 'son'],
          ),
        ).toEqual({
          mother: 'atRiskCarrier',
          father: 'unknown',
          sistersFather: 'affected',
          woman: 'atRiskCarrier',
          sister: 'affected',
          brother: 'atRiskAffected',
          partner: 'unknown',
          son: 'affected',
        });
      });
    });

    describe('an affected son and an affected maternal uncle', () => {
      /**
       *            grandmother --- grandfather
       *          |       |        |
       *    uncle (aff)  aunt    mother --- father --- (paternalGrandmother)
       *                           |                     |
       *                  woman  sister  brother    paternalAunt
       *                    |
       *               son (affected)
       */
      it('marks her, her mother and her grandmother obligate carriers and nobody else', () => {
        expect(
          everyStatus(
            {
              grandmother: 'female',
              grandfather: 'male',
              uncle: 'male',
              aunt: 'female',
              mother: 'female',
              father: 'male',
              paternalGrandmother: 'female',
              paternalAunt: 'female',
              woman: 'female',
              sister: 'female',
              brother: 'male',
              partner: 'male',
              son: 'male',
            },
            [
              ...bio(
                ['grandmother', 'grandfather'],
                ['uncle', 'aunt', 'mother'],
              ),
              ...bio(['paternalGrandmother'], ['father', 'paternalAunt']),
              ...bio(['mother', 'father'], ['woman', 'sister', 'brother']),
              ...bio(['woman', 'partner'], ['son']),
            ],
            ['uncle', 'son'],
          ),
        ).toEqual({
          grandmother: 'obligateCarrier',
          grandfather: 'unknown',
          uncle: 'affected',
          aunt: 'atRiskCarrier',
          mother: 'obligateCarrier',
          father: 'unknown',
          paternalGrandmother: 'unknown',
          paternalAunt: 'unknown',
          woman: 'obligateCarrier',
          sister: 'atRiskCarrier',
          brother: 'atRiskAffected',
          partner: 'unknown',
          son: 'affected',
        });
      });

      it('marks the same three when no father is recorded, since none of the women between is affected', () => {
        expect(
          everyStatus(
            {
              grandmother: 'female',
              uncle: 'male',
              mother: 'female',
              woman: 'female',
              son: 'male',
            },
            [
              ...bio(['grandmother'], ['uncle', 'mother']),
              ['mother', 'woman'],
              ['woman', 'son'],
            ],
            ['uncle', 'son'],
          ),
        ).toEqual({
          grandmother: 'obligateCarrier',
          uncle: 'affected',
          mother: 'obligateCarrier',
          woman: 'obligateCarrier',
          son: 'affected',
        });
      });
    });

    describe('an affected son and a relative further up her mother’s line', () => {
      /**
       *     greatGrandmother --- greatGrandfather
       *         |                  |
       *    greatUncle         grandmother --- grandfather
       *                            |
       *                         mother --- father
       *                            |
       *                         woman --- partner
       *                            |
       *                       son (affected)
       */
      const people: Record<string, Sex> = {
        greatGrandmother: 'female',
        greatGrandfather: 'male',
        greatUncle: 'male',
        grandmother: 'female',
        grandfather: 'male',
        mother: 'female',
        father: 'male',
        woman: 'female',
        partner: 'male',
        son: 'male',
      };
      const top = bio(
        ['greatGrandmother', 'greatGrandfather'],
        ['greatUncle', 'grandmother'],
      );
      const below = [
        ...bio(['mother', 'father'], ['woman']),
        ...bio(['woman', 'partner'], ['son']),
      ];

      it('counts an affected great-uncle through the female line', () => {
        expect(
          everyStatus(
            people,
            [
              ...top,
              ...bio(['grandmother', 'grandfather'], ['mother']),
              ...below,
            ],
            ['greatUncle', 'son'],
          ),
        ).toEqual({
          greatGrandmother: 'obligateCarrier',
          greatGrandfather: 'unknown',
          greatUncle: 'affected',
          grandmother: 'obligateCarrier',
          grandfather: 'unknown',
          mother: 'obligateCarrier',
          father: 'unknown',
          woman: 'obligateCarrier',
          partner: 'unknown',
          son: 'affected',
        });
      });

      it('counts an affected great-grandmother', () => {
        expect(
          everyStatus(
            people,
            [
              ...top,
              ...bio(['grandmother', 'grandfather'], ['mother']),
              ...below,
            ],
            ['greatGrandmother', 'son'],
          ),
        ).toEqual({
          greatGrandmother: 'affected',
          greatGrandfather: 'unknown',
          greatUncle: 'atRiskAffected',
          grandmother: 'obligateCarrier',
          grandfather: 'unknown',
          mother: 'obligateCarrier',
          father: 'unknown',
          woman: 'obligateCarrier',
          partner: 'unknown',
          son: 'affected',
        });
      });

      it('stops at a gestational link anywhere in the chain', () => {
        expect(
          everyStatus(
            people,
            [
              ...top,
              ['grandmother', 'mother', 'surrogate'],
              ['grandfather', 'mother'],
              ...below,
            ],
            ['greatGrandmother', 'son'],
          ),
        ).toEqual({
          greatGrandmother: 'affected',
          greatGrandfather: 'unknown',
          greatUncle: 'atRiskAffected',
          grandmother: 'atRiskCarrier',
          grandfather: 'unknown',
          mother: 'atRiskCarrier',
          father: 'unknown',
          woman: 'atRiskCarrier',
          partner: 'unknown',
          son: 'affected',
        });
      });
    });

    describe('no affected son: the lines of two daughters', () => {
      /**
       *     partner1 --- woman --- partner2
       *          |                 |
       *   daughter1 --- husband1  daughter2 --- husband2
       *        |                       |
       *   grandson1 (affected)    grandson2 (affected)
       */
      const people: Record<string, Sex> = {
        woman: 'female',
        partner1: 'male',
        partner2: 'male',
        daughter1: 'female',
        daughter2: 'female',
        husband1: 'male',
        husband2: 'male',
        grandson1: 'male',
        grandson2: 'male',
      };
      const grandsons = [
        ...bio(['daughter1', 'husband1'], ['grandson1']),
        ...bio(['daughter2', 'husband2'], ['grandson2']),
      ];

      it('marks her and both daughters obligate carriers when the daughters have different fathers', () => {
        expect(
          everyStatus(
            people,
            [
              ...bio(['woman', 'partner1'], ['daughter1']),
              ...bio(['woman', 'partner2'], ['daughter2']),
              ...grandsons,
            ],
            ['grandson1', 'grandson2'],
          ),
        ).toEqual({
          woman: 'obligateCarrier',
          partner1: 'unknown',
          partner2: 'unknown',
          daughter1: 'obligateCarrier',
          daughter2: 'obligateCarrier',
          husband1: 'unknown',
          husband2: 'unknown',
          grandson1: 'affected',
          grandson2: 'affected',
        });
      });

      it('leaves her at risk when one father could explain both daughters’ lines', () => {
        // One event in partner1 (a germline mosaic, or an affected man not
        // recorded as such) would explain both lines without her.
        expect(
          everyStatus(
            people,
            [
              ...bio(['woman', 'partner1'], ['daughter1', 'daughter2']),
              ...grandsons,
            ],
            ['grandson1', 'grandson2'],
          ),
        ).toEqual({
          woman: 'atRiskCarrier',
          partner1: 'unknown',
          partner2: 'unknown',
          daughter1: 'obligateCarrier',
          daughter2: 'obligateCarrier',
          husband1: 'unknown',
          husband2: 'unknown',
          grandson1: 'affected',
          grandson2: 'affected',
        });
      });

      it('leaves her at risk when her daughters with no recorded father may share a father', () => {
        expect(
          everyStatus(
            people,
            [['woman', 'daughter1'], ['woman', 'daughter2'], ...grandsons],
            ['grandson1', 'grandson2'],
          ),
        ).toEqual({
          woman: 'atRiskCarrier',
          partner1: 'unknown',
          partner2: 'unknown',
          daughter1: 'obligateCarrier',
          daughter2: 'obligateCarrier',
          husband1: 'unknown',
          husband2: 'unknown',
          grandson1: 'affected',
          grandson2: 'affected',
        });
      });

      it('does not mark her when one father could explain two affected daughters', () => {
        expect(
          everyStatus(
            { woman: 'female', partner1: 'male', d1: 'female', d2: 'female' },
            bio(['woman', 'partner1'], ['d1', 'd2']),
            ['d1', 'd2'],
          ),
        ).toEqual({
          woman: 'unknown',
          partner1: 'unknown',
          d1: 'affected',
          d2: 'affected',
        });
      });

      it('marks her when two affected daughters have different recorded fathers', () => {
        expect(
          everyStatus(
            {
              woman: 'female',
              partner1: 'male',
              partner2: 'male',
              d1: 'female',
              d2: 'female',
            },
            [
              ...bio(['woman', 'partner1'], ['d1']),
              ...bio(['woman', 'partner2'], ['d2']),
            ],
            ['d1', 'd2'],
          ),
        ).toEqual({
          woman: 'obligateCarrier',
          partner1: 'unknown',
          partner2: 'unknown',
          d1: 'affected',
          d2: 'affected',
        });
      });

      it('marks her when an affected son joins the lines of daughters by one father', () => {
        expect(
          everyStatus(
            { ...people, son: 'male' },
            [
              ...bio(['woman', 'partner1'], ['daughter1', 'daughter2', 'son']),
              ...grandsons,
            ],
            ['son', 'grandson1', 'grandson2'],
          ),
        ).toEqual({
          woman: 'obligateCarrier',
          partner1: 'unknown',
          partner2: 'unknown',
          daughter1: 'obligateCarrier',
          daughter2: 'obligateCarrier',
          son: 'affected',
          husband1: 'unknown',
          husband2: 'unknown',
          grandson1: 'affected',
          grandson2: 'affected',
        });
      });
    });

    describe('daughters with no recorded father may share a recorded father', () => {
      /**
       *     partner1 --- woman --- partner2      (daughter3: no recorded father)
       *          |                 |                  |
       *   daughter1 --- husband1  daughter2 --- husband2   daughter3 --- husband3
       *        |                       |                        |
       *   grandson1 (affected)    grandson2 (affected)     grandson3 (affected)
       */
      const people: Record<string, Sex> = {
        woman: 'female',
        partner1: 'male',
        partner2: 'male',
        daughter1: 'female',
        daughter2: 'female',
        daughter3: 'female',
        husband1: 'male',
        husband2: 'male',
        husband3: 'male',
        grandson1: 'male',
        grandson2: 'male',
        grandson3: 'male',
      };
      const grandsons = [
        ...bio(['daughter1', 'husband1'], ['grandson1']),
        ...bio(['daughter2', 'husband2'], ['grandson2']),
        ...bio(['daughter3', 'husband3'], ['grandson3']),
      ];
      const untouched = {
        partner1: 'unknown',
        partner2: 'unknown',
        husband1: 'unknown',
        husband2: 'unknown',
        husband3: 'unknown',
        grandson1: 'affected',
        grandson2: 'affected',
        grandson3: 'affected',
      } satisfies Record<string, Status>;

      it('marks her with an affected son and the line of a daughter with no recorded father', () => {
        expect(
          everyStatus(
            { ...people, son: 'male' },
            [
              ['woman', 'daughter3'],
              ...bio(['woman', 'partner1'], ['son', 'daughter1']),
              ...grandsons,
            ],
            ['son', 'grandson3'],
          ),
        ).toEqual({
          ...untouched,
          woman: 'obligateCarrier',
          son: 'affected',
          daughter1: 'atRiskCarrier',
          daughter2: 'unknown',
          daughter3: 'obligateCarrier',
          grandson1: 'atRiskAffected',
          grandson2: 'unknown',
        });
      });

      it('leaves her at risk when the father of one daughter’s line may also be the father of the daughter with none', () => {
        expect(
          everyStatus(
            people,
            [
              ...bio(['woman', 'partner1'], ['daughter1']),
              ['woman', 'daughter3'],
              ...grandsons,
            ],
            ['grandson1', 'grandson3'],
          ),
        ).toEqual({
          ...untouched,
          woman: 'atRiskCarrier',
          daughter1: 'obligateCarrier',
          daughter2: 'unknown',
          daughter3: 'obligateCarrier',
          grandson2: 'unknown',
        });
      });

      it('marks her when no one father could explain daughters’ lines by two recorded fathers and by none', () => {
        expect(
          everyStatus(
            people,
            [
              ...bio(['woman', 'partner1'], ['daughter1']),
              ...bio(['woman', 'partner2'], ['daughter2']),
              ['woman', 'daughter3'],
              ...grandsons,
            ],
            ['grandson1', 'grandson2', 'grandson3'],
          ),
        ).toEqual({
          ...untouched,
          woman: 'obligateCarrier',
          daughter1: 'obligateCarrier',
          daughter2: 'obligateCarrier',
          daughter3: 'obligateCarrier',
        });
      });

      it('marks her with an affected son and daughters by a recorded father and by none', () => {
        expect(
          everyStatus(
            { ...people, son: 'male' },
            [
              ...bio(['woman', 'partner1'], ['son', 'daughter1']),
              ['woman', 'daughter3'],
              ...grandsons,
            ],
            ['son', 'grandson1', 'grandson3'],
          ),
        ).toEqual({
          ...untouched,
          woman: 'obligateCarrier',
          son: 'affected',
          daughter1: 'obligateCarrier',
          daughter2: 'unknown',
          daughter3: 'obligateCarrier',
          grandson2: 'unknown',
        });
      });

      it('does not mark the mother of an affected daughter by a recorded father and a daughter with no recorded father who has an affected son', () => {
        // Her daughter with no recorded father may be partner1's, so one event in
        // partner1 could explain both daughters. That daughter still has her own son
        // and, through her affected sister, her mother's family.
        expect(
          everyStatus(
            {
              mother: 'female',
              partner1: 'male',
              sister: 'female',
              woman: 'female',
              son: 'male',
            },
            [
              ...bio(['mother', 'partner1'], ['sister']),
              ['mother', 'woman'],
              ['woman', 'son'],
            ],
            ['sister', 'son'],
          ),
        ).toEqual({
          mother: 'atRiskCarrier',
          partner1: 'unknown',
          sister: 'affected',
          woman: 'obligateCarrier',
          son: 'affected',
        });
      });

      it('leaves her at risk when the daughter with no recorded father could be the daughter of a father whose daughters give nothing', () => {
        expect(
          everyStatus(
            {
              woman: 'female',
              partner1: 'male',
              partner2: 'male',
              daughter0: 'female',
              daughter2: 'female',
              daughter1: 'female',
              grandson: 'male',
            },
            [
              ...bio(['woman', 'partner1'], ['daughter0']),
              ['woman', 'daughter2'],
              ...bio(['woman', 'partner2'], ['daughter1']),
              ['daughter2', 'grandson'],
            ],
            ['daughter1', 'grandson'],
          ),
        ).toEqual({
          woman: 'atRiskCarrier',
          partner1: 'unknown',
          partner2: 'unknown',
          daughter0: 'atRiskCarrier',
          daughter2: 'obligateCarrier',
          daughter1: 'affected',
          grandson: 'affected',
        });
      });
    });

    describe('one man who could explain every affected person', () => {
      /**
       *                grandmother --- grandfather
       *                     |               |
       *            aunt (A)                 sister (B)
       *              | --- man (Q) --- |
       *   daughterA (affected)     daughterB (affected)
       */
      const people: Record<string, Sex> = {
        grandmother: 'female',
        grandfather: 'male',
        A: 'female',
        B: 'female',
        Q: 'male',
        daughterA: 'female',
        daughterB: 'female',
      };
      const sisters = bio(['grandmother', 'grandfather'], ['A', 'B']);

      it('marks no one when one man fathered both affected cousins', () => {
        expect(
          everyStatus(
            people,
            [
              ...sisters,
              ...bio(['A', 'Q'], ['daughterA']),
              ...bio(['B', 'Q'], ['daughterB']),
            ],
            ['daughterA', 'daughterB'],
          ),
        ).toEqual({
          grandmother: 'unknown',
          grandfather: 'unknown',
          A: 'unknown',
          B: 'unknown',
          Q: 'unknown',
          daughterA: 'affected',
          daughterB: 'affected',
        });
      });

      it('marks no one obligate when one man fathered the unaffected mothers of both affected cousins', () => {
        expect(
          everyStatus(
            { ...people, sonA: 'male', sonB: 'male' },
            [
              ...sisters,
              ...bio(['A', 'Q'], ['daughterA']),
              ...bio(['B', 'Q'], ['daughterB']),
              ['daughterA', 'sonA'],
              ['daughterB', 'sonB'],
            ],
            ['sonA', 'sonB'],
          ),
        ).toEqual({
          grandmother: 'unknown',
          grandfather: 'unknown',
          A: 'atRiskCarrier',
          B: 'atRiskCarrier',
          Q: 'unknown',
          daughterA: 'obligateCarrier',
          daughterB: 'obligateCarrier',
          sonA: 'affected',
          sonB: 'affected',
        });
      });

      it('marks both sisters when two different men fathered the affected cousins', () => {
        expect(
          everyStatus(
            { ...people, R: 'male' },
            [
              ...sisters,
              ...bio(['A', 'Q'], ['daughterA']),
              ...bio(['B', 'R'], ['daughterB']),
            ],
            ['daughterA', 'daughterB'],
          ),
        ).toEqual({
          grandmother: 'unknown',
          grandfather: 'unknown',
          A: 'obligateCarrier',
          B: 'obligateCarrier',
          Q: 'unknown',
          R: 'unknown',
          daughterA: 'affected',
          daughterB: 'affected',
        });
      });

      it('marks the sisters but not their mother when one sister also has an affected son', () => {
        // Their father could explain both sisters' lines, so their mother is
        // not marked. No one man could explain the son and both cousins.
        expect(
          everyStatus(
            { ...people, sonA: 'male' },
            [
              ...sisters,
              ...bio(['A', 'Q'], ['daughterA', 'sonA']),
              ...bio(['B', 'Q'], ['daughterB']),
            ],
            ['daughterA', 'daughterB', 'sonA'],
          ),
        ).toEqual({
          grandmother: 'atRiskCarrier',
          grandfather: 'unknown',
          A: 'obligateCarrier',
          B: 'obligateCarrier',
          Q: 'unknown',
          daughterA: 'affected',
          daughterB: 'affected',
          sonA: 'affected',
        });
      });

      it('marks her when each of three affected grandsons has a different man on his route', () => {
        expect(
          everyStatus(
            {
              woman: 'female',
              partner1: 'male',
              partner2: 'male',
              partner3: 'male',
              daughter1: 'female',
              daughter2: 'female',
              daughter3: 'female',
              grandson1: 'male',
              grandson2: 'male',
              grandson3: 'male',
            },
            [
              ...bio(['woman', 'partner1'], ['daughter1']),
              ...bio(['woman', 'partner2'], ['daughter2']),
              ...bio(['woman', 'partner3'], ['daughter3']),
              ['daughter1', 'grandson1'],
              ['daughter2', 'grandson2'],
              ['daughter3', 'grandson3'],
            ],
            ['grandson1', 'grandson2', 'grandson3'],
          ),
        ).toEqual({
          woman: 'obligateCarrier',
          partner1: 'unknown',
          partner2: 'unknown',
          partner3: 'unknown',
          daughter1: 'obligateCarrier',
          daughter2: 'obligateCarrier',
          daughter3: 'obligateCarrier',
          grandson1: 'affected',
          grandson2: 'affected',
          grandson3: 'affected',
        });
      });

      it('does not mark her when the father of her affected daughter also fathered her half-sister, who has an affected son', () => {
        // Her half-sister has a son of her own, which no man explains, so she
        // is marked.
        expect(
          everyStatus(
            {
              mother: 'female',
              father: 'male',
              Q: 'male',
              woman: 'female',
              halfSister: 'female',
              nephew: 'male',
              daughter: 'female',
            },
            [
              ...bio(['mother', 'father'], ['woman']),
              ...bio(['mother', 'Q'], ['halfSister']),
              ['halfSister', 'nephew'],
              ...bio(['woman', 'Q'], ['daughter']),
            ],
            ['nephew', 'daughter'],
          ),
        ).toEqual({
          mother: 'atRiskCarrier',
          father: 'unknown',
          Q: 'unknown',
          woman: 'atRiskCarrier',
          halfSister: 'obligateCarrier',
          nephew: 'affected',
          daughter: 'affected',
        });
      });

      it('lets a daughter with no recorded father stand for the father of her mother’s son', () => {
        // The man who fathered her son may have fathered her daughter too, and
        // he fathered her niece, whose son is affected.
        expect(
          everyStatus(
            {
              mother: 'female',
              father: 'male',
              woman: 'female',
              sister: 'female',
              R: 'male',
              niece: 'female',
              nephew: 'male',
              son: 'male',
              daughter: 'female',
              grandson: 'male',
            },
            [
              ...bio(['mother', 'father'], ['woman', 'sister']),
              ...bio(['sister', 'R'], ['niece']),
              ['niece', 'nephew'],
              ...bio(['woman', 'R'], ['son']),
              ['woman', 'daughter'],
              ['daughter', 'grandson'],
            ],
            ['nephew', 'grandson'],
          ),
        ).toEqual({
          mother: 'unknown',
          father: 'unknown',
          woman: 'atRiskCarrier',
          sister: 'atRiskCarrier',
          R: 'unknown',
          niece: 'obligateCarrier',
          nephew: 'affected',
          son: 'atRiskAffected',
          daughter: 'obligateCarrier',
          grandson: 'affected',
        });
      });

      it('tells apart the unrecorded fathers of different mothers', () => {
        // Her daughter's father and her sister's father are both unrecorded,
        // but they are fathers in different generations. Her sister has her
        // own affected son, so she is marked too.
        expect(
          everyStatus(
            {
              mother: 'female',
              woman: 'female',
              sister: 'female',
              nephew: 'male',
              daughter: 'female',
              grandson: 'male',
            },
            [
              ['mother', 'woman'],
              ['mother', 'sister'],
              ['sister', 'nephew'],
              ['woman', 'daughter'],
              ['daughter', 'grandson'],
            ],
            ['nephew', 'grandson'],
          ),
        ).toEqual({
          mother: 'atRiskCarrier',
          woman: 'obligateCarrier',
          sister: 'obligateCarrier',
          nephew: 'affected',
          daughter: 'obligateCarrier',
          grandson: 'affected',
        });
      });
    });

    describe('an affected man who may be the father of a female on the route', () => {
      // Each shape gives the same statuses whether the affected man is
      // recorded as her father or she has no recorded father and he fathered
      // another child of her mother.
      it('takes nothing from the line of her daughter with no recorded father when the father of her affected son is affected', () => {
        const people: Record<string, Sex> = {
          woman: 'female',
          Q: 'male',
          son: 'male',
          daughter: 'female',
          grandson: 'male',
        };
        const expected = {
          woman: 'atRiskCarrier',
          Q: 'affected',
          son: 'affected',
          daughter: 'obligateCarrier',
          grandson: 'affected',
        } satisfies Record<string, Status>;
        for (const daughterLinks of [
          [['woman', 'daughter']] satisfies Link[],
          bio(['woman', 'Q'], ['daughter']),
        ]) {
          expect(
            everyStatus(
              people,
              [
                ...bio(['woman', 'Q'], ['son']),
                ...daughterLinks,
                ['daughter', 'grandson'],
              ],
              ['Q', 'son', 'grandson'],
            ),
          ).toEqual(expected);
        }
      });

      it('takes nothing from that line beside an affected brother, for her or her mother', () => {
        const people: Record<string, Sex> = {
          mother: 'female',
          woman: 'female',
          brother: 'male',
          Q: 'male',
          son: 'male',
          daughter: 'female',
          grandson: 'male',
        };
        const expected = {
          mother: 'atRiskCarrier',
          woman: 'atRiskCarrier',
          brother: 'affected',
          Q: 'affected',
          son: 'atRiskAffected',
          daughter: 'obligateCarrier',
          grandson: 'affected',
        } satisfies Record<string, Status>;
        for (const daughterLinks of [
          [['woman', 'daughter']] satisfies Link[],
          bio(['woman', 'Q'], ['daughter']),
        ]) {
          expect(
            everyStatus(
              people,
              [
                ['mother', 'woman'],
                ['mother', 'brother'],
                ...bio(['woman', 'Q'], ['son']),
                ...daughterLinks,
                ['daughter', 'grandson'],
              ],
              ['brother', 'Q', 'grandson'],
            ),
          ).toEqual(expected);
        }
      });

      it('takes nothing from the line of a niece with no recorded father when her sister’s partner is affected', () => {
        const people: Record<string, Sex> = {
          mother: 'female',
          woman: 'female',
          son: 'male',
          sister: 'female',
          Q: 'male',
          nephew: 'male',
          niece: 'female',
          grandnephew: 'male',
        };
        const expected = {
          mother: 'atRiskCarrier',
          woman: 'atRiskCarrier',
          son: 'affected',
          sister: 'atRiskCarrier',
          Q: 'affected',
          nephew: 'atRiskAffected',
          niece: 'obligateCarrier',
          grandnephew: 'affected',
        } satisfies Record<string, Status>;
        for (const nieceLinks of [
          [['sister', 'niece']] satisfies Link[],
          bio(['sister', 'Q'], ['niece']),
        ]) {
          expect(
            everyStatus(
              people,
              [
                ['mother', 'woman'],
                ['mother', 'sister'],
                ['woman', 'son'],
                ...bio(['sister', 'Q'], ['nephew']),
                ...nieceLinks,
                ['niece', 'grandnephew'],
              ],
              ['son', 'Q', 'grandnephew'],
            ),
          ).toEqual(expected);
        }
      });
    });

    describe('a man who could explain her affected mother', () => {
      it('does not mark her when the father of her affected daughter may also be her affected mother’s father', () => {
        // Her mother has no recorded father, and Q fathered another child of
        // her grandmother, so one event in Q could explain both.
        expect(
          everyStatus(
            {
              grandmother: 'female',
              mother: 'female',
              aunt: 'female',
              Q: 'male',
              woman: 'female',
              daughter: 'female',
            },
            [
              ['grandmother', 'mother'],
              ...bio(['grandmother', 'Q'], ['aunt']),
              ['mother', 'woman'],
              ...bio(['woman', 'Q'], ['daughter']),
            ],
            ['mother', 'daughter'],
          ),
        ).toEqual({
          grandmother: 'unknown',
          mother: 'affected',
          aunt: 'unknown',
          Q: 'unknown',
          woman: 'atRiskCarrier',
          daughter: 'affected',
        });
      });

      it('does not mark her when her affected mother’s recorded father also fathered her affected daughter', () => {
        expect(
          everyStatus(
            {
              grandmother: 'female',
              grandfather: 'male',
              mother: 'female',
              woman: 'female',
              daughter: 'female',
            },
            [
              ...bio(['grandmother', 'grandfather'], ['mother']),
              ['mother', 'woman'],
              ...bio(['woman', 'grandfather'], ['daughter']),
            ],
            ['mother', 'daughter'],
          ),
        ).toEqual({
          grandmother: 'unknown',
          grandfather: 'unknown',
          mother: 'affected',
          woman: 'atRiskCarrier',
          daughter: 'affected',
        });
      });

      it('marks her with an affected mother whose father is recorded and an affected son', () => {
        expect(
          everyStatus(
            {
              grandmother: 'female',
              grandfather: 'male',
              mother: 'female',
              woman: 'female',
              partner: 'male',
              son: 'male',
            },
            [
              ...bio(['grandmother', 'grandfather'], ['mother']),
              ['mother', 'woman'],
              ...bio(['woman', 'partner'], ['son']),
            ],
            ['mother', 'son'],
          ),
        ).toEqual({
          grandmother: 'unknown',
          grandfather: 'unknown',
          mother: 'affected',
          woman: 'obligateCarrier',
          partner: 'unknown',
          son: 'affected',
        });
      });

      it('marks her with an affected mother whose father is not recorded and an affected daughter by another man', () => {
        expect(
          everyStatus(
            {
              grandmother: 'female',
              mother: 'female',
              woman: 'female',
              partner: 'male',
              daughter: 'female',
            },
            [
              ['grandmother', 'mother'],
              ['mother', 'woman'],
              ...bio(['woman', 'partner'], ['daughter']),
            ],
            ['mother', 'daughter'],
          ),
        ).toEqual({
          grandmother: 'unknown',
          mother: 'affected',
          woman: 'obligateCarrier',
          partner: 'unknown',
          daughter: 'affected',
        });
      });
    });

    describe('recorded fathers on the route', () => {
      /**
       *         woman
       *        |     |
       *   son (aff)  daughter --- husband
       *                 |
       *            grandson (affected)
       */
      it('lets a daughter with no recorded father link to an affected son of hers', () => {
        expect(
          everyStatus(
            {
              woman: 'female',
              son: 'male',
              daughter: 'female',
              husband: 'male',
              grandson: 'male',
            },
            [
              ['woman', 'son'],
              ['woman', 'daughter'],
              ...bio(['daughter', 'husband'], ['grandson']),
            ],
            ['son', 'grandson'],
          ),
        ).toEqual({
          woman: 'obligateCarrier',
          son: 'affected',
          daughter: 'obligateCarrier',
          husband: 'unknown',
          grandson: 'affected',
        });
      });

      it('takes nothing from an affected daughter with no recorded father', () => {
        expect(
          everyStatus(
            { woman: 'female', son: 'male', daughter: 'female' },
            [
              ['woman', 'son'],
              ['woman', 'daughter'],
            ],
            ['son', 'daughter'],
          ),
        ).toEqual({
          woman: 'atRiskCarrier',
          son: 'affected',
          daughter: 'affected',
        });
      });

      it('takes nothing from the line below an affected daughter with no recorded father', () => {
        // Her unrecorded father may be affected, which would explain her son
        // as well as her.
        expect(
          everyStatus(
            {
              woman: 'female',
              partner: 'male',
              son: 'male',
              daughter: 'female',
              husband: 'male',
              grandson: 'male',
            },
            [
              ...bio(['woman', 'partner'], ['son']),
              ['woman', 'daughter'],
              ...bio(['daughter', 'husband'], ['grandson']),
            ],
            ['son', 'daughter', 'grandson'],
          ),
        ).toEqual({
          woman: 'atRiskCarrier',
          partner: 'unknown',
          son: 'affected',
          daughter: 'affected',
          husband: 'unknown',
          grandson: 'affected',
        });
      });

      it('takes nothing from an affected daughter whose other recorded parent is not male', () => {
        expect(
          everyStatus(
            {
              woman: 'female',
              partner: 'male',
              otherParent: 'unknown',
              son: 'male',
              daughter: 'female',
            },
            [
              ...bio(['woman', 'partner'], ['son']),
              ...bio(['woman', 'otherParent'], ['daughter']),
            ],
            ['son', 'daughter'],
          ),
        ).toEqual({
          woman: 'atRiskCarrier',
          partner: 'unknown',
          otherParent: 'unknown',
          son: 'affected',
          daughter: 'affected',
        });
      });

      it('takes nothing from the line of a daughter whose other parent is affected and not male', () => {
        expect(
          everyStatus(
            {
              woman: 'female',
              partner: 'male',
              otherParent: 'unknown',
              son: 'male',
              daughter: 'female',
              grandson: 'male',
            },
            [
              ...bio(['woman', 'partner'], ['son']),
              ...bio(['woman', 'otherParent'], ['daughter']),
              ['daughter', 'grandson'],
            ],
            ['otherParent', 'son', 'grandson'],
          ),
        ).toEqual({
          woman: 'atRiskCarrier',
          partner: 'unknown',
          otherParent: 'affected',
          son: 'affected',
          daughter: 'obligateCarrier',
          grandson: 'affected',
        });
      });
    });

    describe('an affected brother and an affected grandson through a daughter', () => {
      /**
       *          mother --- father
       *           |        |
       *        woman    brother (affected)
       *          | --- partner
       *       daughter --- husband
       *          |
       *    grandson (affected)
       */
      it('marks her, her mother and her daughter obligate carriers', () => {
        expect(
          everyStatus(
            {
              mother: 'female',
              father: 'male',
              woman: 'female',
              brother: 'male',
              partner: 'male',
              daughter: 'female',
              husband: 'male',
              grandson: 'male',
            },
            [
              ...bio(['mother', 'father'], ['woman', 'brother']),
              ...bio(['woman', 'partner'], ['daughter']),
              ...bio(['daughter', 'husband'], ['grandson']),
            ],
            ['brother', 'grandson'],
          ),
        ).toEqual({
          mother: 'obligateCarrier',
          father: 'unknown',
          woman: 'obligateCarrier',
          brother: 'affected',
          partner: 'unknown',
          daughter: 'obligateCarrier',
          husband: 'unknown',
          grandson: 'affected',
        });
      });
    });

    describe('one side only leaves her at risk', () => {
      it('one daughter with two affected sons is a single line, however strong', () => {
        /**
         *   mother --- father
         *        |
         *     woman --- partner
         *        |
         *   daughter --- husband
         *     |      |
         *   grandson1  grandson2 (both affected)
         */
        expect(
          everyStatus(
            {
              mother: 'female',
              father: 'male',
              woman: 'female',
              partner: 'male',
              daughter: 'female',
              husband: 'male',
              grandson1: 'male',
              grandson2: 'male',
            },
            [
              ...bio(['mother', 'father'], ['woman']),
              ...bio(['woman', 'partner'], ['daughter']),
              ...bio(['daughter', 'husband'], ['grandson1', 'grandson2']),
            ],
            ['grandson1', 'grandson2'],
          ),
        ).toEqual({
          mother: 'unknown',
          father: 'unknown',
          woman: 'atRiskCarrier',
          partner: 'unknown',
          daughter: 'obligateCarrier',
          husband: 'unknown',
          grandson1: 'affected',
          grandson2: 'affected',
        });
      });

      it('an affected mother and an affected brother are a single side', () => {
        expect(
          everyStatus(
            {
              mother: 'female',
              father: 'male',
              woman: 'female',
              brother: 'male',
            },
            bio(['mother', 'father'], ['woman', 'brother']),
            ['mother', 'brother'],
          ),
        ).toEqual({
          mother: 'affected',
          father: 'unknown',
          woman: 'atRiskCarrier',
          brother: 'affected',
        });
      });

      it('takes nothing from an affected paternal uncle', () => {
        expect(
          everyStatus(
            {
              paternalGrandmother: 'female',
              paternalGrandfather: 'male',
              father: 'male',
              paternalUncle: 'male',
              mother: 'female',
              woman: 'female',
              partner: 'male',
              son: 'male',
            },
            [
              ...bio(
                ['paternalGrandmother', 'paternalGrandfather'],
                ['father', 'paternalUncle'],
              ),
              ...bio(['mother', 'father'], ['woman']),
              ...bio(['woman', 'partner'], ['son']),
            ],
            ['paternalUncle', 'son'],
          ),
        ).toEqual({
          paternalGrandmother: 'atRiskCarrier',
          paternalGrandfather: 'unknown',
          father: 'atRiskAffected',
          paternalUncle: 'affected',
          mother: 'atRiskCarrier',
          woman: 'atRiskCarrier',
          partner: 'unknown',
          son: 'affected',
        });
      });

      it('takes nothing from an affected paternal grandmother', () => {
        expect(
          everyStatus(
            {
              paternalGrandmother: 'female',
              paternalGrandfather: 'male',
              father: 'male',
              mother: 'female',
              woman: 'female',
              partner: 'male',
              son: 'male',
            },
            [
              ...bio(
                ['paternalGrandmother', 'paternalGrandfather'],
                ['father'],
              ),
              ...bio(['mother', 'father'], ['woman']),
              ...bio(['woman', 'partner'], ['son']),
            ],
            ['paternalGrandmother', 'son'],
          ),
        ).toEqual({
          paternalGrandmother: 'affected',
          paternalGrandfather: 'unknown',
          father: 'atRiskAffected',
          mother: 'atRiskCarrier',
          woman: 'atRiskCarrier',
          partner: 'unknown',
          son: 'affected',
        });
      });

      it("takes nothing from her son's paternal relatives", () => {
        expect(
          everyStatus(
            {
              partnersMother: 'female',
              partnersBrother: 'male',
              woman: 'female',
              partner: 'male',
              son: 'male',
            },
            [
              ...bio(['partnersMother'], ['partner', 'partnersBrother']),
              ...bio(['woman', 'partner'], ['son']),
            ],
            ['partnersMother', 'partnersBrother', 'son'],
          ),
        ).toEqual({
          partnersMother: 'affected',
          partnersBrother: 'affected',
          woman: 'atRiskCarrier',
          partner: 'atRiskAffected',
          son: 'affected',
        });
      });

      it("takes nothing from a daughter's line whose father is affected", () => {
        /**
         *     woman --- partner (affected)
         *       |          |
         *   son (aff)   daughter --- husband
         *                  |
         *            grandson (affected)
         */
        expect(
          everyStatus(
            {
              woman: 'female',
              partner: 'male',
              son: 'male',
              daughter: 'female',
              husband: 'male',
              grandson: 'male',
            },
            [
              ...bio(['woman', 'partner'], ['son', 'daughter']),
              ...bio(['daughter', 'husband'], ['grandson']),
            ],
            ['partner', 'son', 'grandson'],
          ),
        ).toEqual({
          woman: 'atRiskCarrier',
          partner: 'affected',
          son: 'affected',
          daughter: 'obligateCarrier',
          husband: 'unknown',
          grandson: 'affected',
        });
      });
    });

    describe('people of uncertain sex give no evidence', () => {
      it('does not count an affected child of uncertain sex as a son', () => {
        expect(
          everyStatus(
            {
              woman: 'female',
              partner: 'male',
              son: 'male',
              child: 'unknown',
            },
            bio(['woman', 'partner'], ['son', 'child']),
            ['son', 'child'],
          ),
        ).toEqual({
          woman: 'atRiskCarrier',
          partner: 'unknown',
          son: 'affected',
          child: 'affected',
        });
      });

      it('does not walk through a child of uncertain sex as a daughter', () => {
        expect(
          everyStatus(
            {
              woman: 'female',
              partner: 'male',
              son: 'male',
              child: 'unknown',
              grandson: 'male',
            },
            [
              ...bio(['woman', 'partner'], ['son', 'child']),
              ['child', 'grandson'],
            ],
            ['son', 'grandson'],
          ),
        ).toEqual({
          woman: 'atRiskCarrier',
          partner: 'unknown',
          son: 'affected',
          child: 'unknown',
          grandson: 'affected',
        });
      });

      it('does not mark a person of uncertain sex with two affected sons', () => {
        expect(
          everyStatus(
            {
              parent: 'unknown',
              partner: 'male',
              son1: 'male',
              son2: 'male',
            },
            bio(['parent', 'partner'], ['son1', 'son2']),
            ['son1', 'son2'],
          ),
        ).toEqual({
          parent: 'unknown',
          partner: 'unknown',
          son1: 'affected',
          son2: 'affected',
        });
      });

      it("does not count her mother's affected parent of uncertain sex as the mother's father", () => {
        expect(
          everyStatus(
            {
              grandmother: 'female',
              grandparent: 'unknown',
              mother: 'female',
              woman: 'female',
              partner: 'male',
              son: 'male',
            },
            [
              ...bio(['grandmother', 'grandparent'], ['mother']),
              ['mother', 'woman'],
              ...bio(['woman', 'partner'], ['son']),
            ],
            ['grandparent', 'son'],
          ),
        ).toEqual({
          grandmother: 'unknown',
          grandparent: 'affected',
          mother: 'atRiskCarrier',
          woman: 'atRiskCarrier',
          partner: 'unknown',
          son: 'affected',
        });
      });
    });

    describe('loops', () => {
      it('terminates on a cycle and does not count her affected son on both sides', () => {
        // The mother is recorded as the woman's daughter too, so the walk up
        // from the woman comes back down to her own son.
        expect(
          everyStatus(
            { mother: 'female', woman: 'female', son: 'male' },
            [
              ['mother', 'woman'],
              ['woman', 'mother'],
              ['woman', 'son'],
            ],
            ['son'],
          ),
        ).toEqual({
          mother: 'atRiskCarrier',
          woman: 'atRiskCarrier',
          son: 'affected',
        });
      });

      it('terminates on a cycle below her that does not pass through her', () => {
        // Her daughter and granddaughter are each recorded as the other's
        // mother.
        expect(
          everyStatus(
            {
              woman: 'female',
              son: 'male',
              daughter: 'female',
              granddaughter: 'female',
            },
            [
              ['woman', 'son'],
              ['woman', 'daughter'],
              ['daughter', 'granddaughter'],
              ['granddaughter', 'daughter'],
            ],
            ['son'],
          ),
        ).toEqual({
          woman: 'atRiskCarrier',
          son: 'affected',
          daughter: 'atRiskCarrier',
          granddaughter: 'atRiskCarrier',
        });
      });

      it('terminates on a cycle above her that does not pass through her', () => {
        // Her mother and grandmother are each recorded as the other's mother.
        expect(
          everyStatus(
            {
              grandmother: 'female',
              mother: 'female',
              woman: 'female',
              son: 'male',
            },
            [
              ['grandmother', 'mother'],
              ['mother', 'grandmother'],
              ['mother', 'woman'],
              ['woman', 'son'],
            ],
            ['son'],
          ),
        ).toEqual({
          grandmother: 'atRiskCarrier',
          mother: 'atRiskCarrier',
          woman: 'atRiskCarrier',
          son: 'affected',
        });
      });

      it('does not count an affected son also recorded as her mother’s son on both sides', () => {
        expect(
          everyStatus(
            { mother: 'female', woman: 'female', son: 'male' },
            [
              ['mother', 'woman'],
              ['mother', 'son'],
              ['woman', 'son'],
            ],
            ['son'],
          ),
        ).toEqual({
          mother: 'atRiskCarrier',
          woman: 'atRiskCarrier',
          son: 'affected',
        });
      });

      it('lets a man on any route to a grandson recorded with two genetic mothers explain him', () => {
        // partner1 is on one route to the grandson and on the route to the
        // other grandson, so he could explain both and the woman is not
        // marked. For the same reason daughter2 is not marked.
        expect(
          everyStatus(
            {
              woman: 'female',
              partner1: 'male',
              partner2: 'male',
              daughter1: 'female',
              daughter2: 'female',
              daughter3: 'female',
              grandson: 'male',
              otherGrandson: 'male',
            },
            [
              ...bio(['woman', 'partner1'], ['daughter1', 'daughter3']),
              ...bio(['woman', 'partner2'], ['daughter2']),
              ...bio(['daughter1', 'daughter2'], ['grandson']),
              ['daughter3', 'otherGrandson'],
            ],
            ['grandson', 'otherGrandson'],
          ),
        ).toEqual({
          woman: 'atRiskCarrier',
          partner1: 'unknown',
          partner2: 'unknown',
          daughter1: 'obligateCarrier',
          daughter2: 'atRiskCarrier',
          daughter3: 'obligateCarrier',
          grandson: 'affected',
          otherGrandson: 'affected',
        });
      });

      it('does not count one affected son recorded with two genetic mothers twice', () => {
        expect(
          everyStatus(
            {
              mother: 'female',
              father: 'male',
              woman: 'female',
              sister: 'female',
              son: 'male',
            },
            [
              ...bio(['mother', 'father'], ['woman', 'sister']),
              ...bio(['woman', 'sister'], ['son']),
            ],
            ['son'],
          ),
        ).toEqual({
          mother: 'atRiskCarrier',
          father: 'unknown',
          woman: 'atRiskCarrier',
          sister: 'atRiskCarrier',
          son: 'affected',
        });
      });
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
    // The B → C → B loop sits below the affected seed, because the XLD step
    // never revisits an affected person and so would stop a loop through A.
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
    const edges = [
      makeGeneticEdge('A', 'B'),
      makeGeneticEdge('B', 'C'),
      makeGeneticEdge('C', 'B'),
    ];
    const resolveSex = sexResolver({ A: 'female', B: 'female', C: 'female' });
    const graph = buildGraph(nodes, edges, resolveSex);
    const affected = new Set(['A']);

    it('terminates on a cyclic pedigree and gives every member of the loop a status', () => {
      const result = computeXLinkedDominant(graph, affected, resolveSex);
      expect(status(result, 'A')).toBe('affected');
      expect(status(result, 'B')).not.toBe('unknown');
      expect(status(result, 'C')).not.toBe('unknown');
    });
  });
});
