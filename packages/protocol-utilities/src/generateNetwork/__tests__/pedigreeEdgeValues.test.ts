import { describe, expect, it } from 'vitest';

import type { Stage, Variables } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
  RELATIONSHIP_TYPE_OPTIONS,
  type VariableValue,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';
import { buildEntityConstraints } from '../constraints/buildConstraints';
import { ruleBrokenByFixedValues } from '../nodes';

type GenerateParams = Parameters<typeof generateNetwork>[0];
type Codebook = GenerateParams['codebook'];

const SEEDS = 50;

/** Two nodes, so a pedigree builds exactly one edge. */
const ONE_EDGE_PEDIGREE = { familyPedigreeNodeCount: { min: 2, max: 2 } };

const EDGE_CONFIG = {
  type: 'kin',
  relationshipTypeVariable: 'relationshipType',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGestationalCarrier',
  gameteRoleVariable: 'gameteRole',
};

/**
 * The `family_edge` definition the development protocol carries, built from the
 * enum Architect locks onto the categorical variable rather than from a copy of
 * the option list, so a written value that stopped being one of the locked
 * options fails here rather than in a protocol nobody runs in this package.
 */
const KIN_VARIABLES: Variables = {
  relationshipType: {
    name: 'relationshipType',
    type: 'categorical',
    options: RELATIONSHIP_TYPE_OPTIONS,
  },
  isActive: { name: 'isActive', type: 'boolean' },
  isGestationalCarrier: { name: 'isGestationalCarrier', type: 'boolean' },
  gameteRole: {
    name: 'gameteRole',
    type: 'categorical',
    options: [
      { value: 'egg', label: 'Egg' },
      { value: 'sperm', label: 'Sperm' },
    ],
  },
};

function codebookWith(
  kinVariables: Record<string, unknown>,
  personVariables: Record<string, unknown> = {},
): Codebook {
  return {
    node: {
      relative: { name: 'Relative', color: 'node-color-seq-1', variables: {} },
      person: {
        name: 'Person',
        color: 'node-color-seq-2',
        variables: personVariables,
      },
    },
    edge: {
      kin: {
        name: 'Kin',
        color: 'edge-color-seq-1',
        variables: kinVariables,
      },
    },
  } as unknown as Codebook;
}

function pedigree(edgeConfig: Record<string, string>): Stage {
  return {
    id: 'stage-pedigree',
    type: 'FamilyPedigree',
    label: 'Family',
    nodeConfig: { type: 'relative', nodeLabelVariable: 'name' },
    edgeConfig,
  } as unknown as Stage;
}

function nameGenerator(nodes: number): Stage {
  return {
    id: 'stage-ng',
    type: 'NameGenerator',
    label: 'People',
    subject: { entity: 'node', type: 'person' },
    prompts: [{ id: 'p1', text: 'Name people' }],
    behaviours: { minNodes: nodes, maxNodes: nodes },
  } as unknown as Stage;
}

/** Pairs `person` nodes only, so it never reaches a pedigree's own people. */
const personCensus = {
  id: 'stage-census',
  type: 'DyadCensus',
  label: 'Ties',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'p1', text: 'Do they know each other?', createEdge: 'kin' }],
} as unknown as Stage;

const CERTAIN_EDGES = {
  ...ONE_EDGE_PEDIGREE,
  censusEdgeProbability: { min: 1, max: 1 },
};

function kinEdges(edges: NcEdge[]): Record<string, VariableValue>[] {
  return edges
    .filter((edge) => edge.type === 'kin')
    .map((edge) => edge[entityAttributesProperty]);
}

/** Everything about a node except the unseeded uid it was given. */
function nodeShape(node: NcNode): Record<string, unknown> {
  const { [entityPrimaryKeyProperty]: _uid, ...rest } = node;
  return rest;
}

/** The same for an edge, with its endpoints read as positions in the node list. */
function edgeShape(nodes: NcNode[]): (edge: NcEdge) => Record<string, unknown> {
  const positions = new Map(
    nodes.map((node, index) => [node[entityPrimaryKeyProperty], index]),
  );
  return (edge) => ({
    type: edge.type,
    from: positions.get(edge.from),
    to: positions.get(edge.to),
  });
}

/**
 * Every edge `handleFamilyPedigree` creates is a parent-child link, and the
 * interview writes a relationship type and an active flag onto every
 * parent-child edge it commits — `buildChildParentage`, `egoCellTransform`,
 * `siblingCellTransform`, `buildParentageBatch`, `AddParentWizard` and
 * `PedigreeView` all do. Synthetic pedigree edges used to carry neither, so
 * anything reading pedigree data saw a relationship the protocol had no value
 * for.
 */
describe('the values a pedigree writes onto its edges', () => {
  it(`records a biological, active parentage on every edge, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: codebookWith(KIN_VARIABLES),
        stages: [pedigree(EDGE_CONFIG)],
      });

      const written = kinEdges(network.edges);
      if (written.length === 0) {
        failures.push(`seed ${seed}: no edges`);
        continue;
      }
      const wrong = written.filter(
        (attributes) =>
          JSON.stringify(attributes.relationshipType) !== '["biological"]' ||
          attributes.isActive !== true,
      );
      if (wrong.length > 0)
        failures.push(`seed ${seed}: ${JSON.stringify(wrong)}`);
    }

    expect(failures).toEqual([]);
  });

  it('leaves the two gamete-side variables unwritten', () => {
    // `isGestationalCarrier` and `gameteRole` are written only where gamete
    // semantics apply — who supplied the egg, who carried the pregnancy — and
    // the generator's random parent-index draw models none of that. A real
    // pedigree without those features carries no such write either, so writing
    // neither is what the runtime does; writing either would invent a fact.
    const { network } = generateNetwork({
      seed: 7,
      codebook: codebookWith(KIN_VARIABLES),
      stages: [pedigree(EDGE_CONFIG)],
    });

    expect(kinEdges(network.edges).length).toBeGreaterThan(0);
    for (const attributes of kinEdges(network.edges)) {
      expect(attributes.isGestationalCarrier).toBeUndefined();
      expect(attributes.gameteRole).toBeUndefined();
    }
  });

  it('writes values the edge type’s own codebook accepts', () => {
    // The written values are judged by the map the draw would have been judged
    // against, so a value the variable's declared rules reject fails here
    // rather than reaching an export.
    const constraints = buildEntityConstraints(KIN_VARIABLES, '2026-07-27');
    const declared = new Set<string>(
      RELATIONSHIP_TYPE_OPTIONS.map((option) => option.value),
    );

    const { network } = generateNetwork({
      seed: 11,
      codebook: codebookWith(KIN_VARIABLES),
      stages: [pedigree(EDGE_CONFIG)],
    });

    expect(kinEdges(network.edges).length).toBeGreaterThan(0);
    for (const attributes of kinEdges(network.edges)) {
      expect(ruleBrokenByFixedValues(constraints, attributes)).toBeUndefined();
      // Categorical values are always arrays, and every member has to be one
      // of the options Architect locks onto the variable.
      const value = attributes.relationshipType;
      expect(Array.isArray(value)).toBe(true);
      for (const member of Array.isArray(value) ? value : []) {
        expect(declared.has(String(member))).toBe(true);
      }
      expect(typeof attributes.isActive).toBe('boolean');
    }
  });

  it('gives every edge its own attribute object', () => {
    // A later AlterEdgeForm fills each edge's attributes in place, so a shared
    // object would have it write through every edge of the stage at once.
    const { network } = generateNetwork({
      seed: 3,
      codebook: codebookWith(KIN_VARIABLES),
      stages: [pedigree(EDGE_CONFIG)],
    });

    const edges = network.edges.filter((edge) => edge.type === 'kin');
    expect(edges.length).toBeGreaterThan(1);
    edges[0]![entityAttributesProperty].isActive = false;
    expect(edges[1]![entityAttributesProperty].isActive).toBe(true);
  });
});

describe('what the pedigree edge values cost the run', () => {
  it('leaves the stage’s own random stream exactly where it was', () => {
    // The pedigree's only draws are its node count and one parent index per
    // child, so the people it builds and who each of them descends from is a
    // fingerprint of that stream and of nothing else — no attribute is drawn
    // on either type here. These are the numbers the stage produced before it
    // wrote anything onto its edges, so a write that cost a draw (or a value
    // routed through `generateEntityAttributes` rather than written) moves
    // every parent after it and fails here.
    const codebook = codebookWith({});
    const shapeOf = (seed: number): { nodes: number; parents: number[][] } => {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [pedigree(EDGE_CONFIG)],
      });
      const positions = new Map(
        network.nodes.map((node, index) => [
          node[entityPrimaryKeyProperty],
          index,
        ]),
      );
      return {
        nodes: network.nodes.length,
        parents: network.edges.map((edge) => [
          positions.get(edge.from) ?? -1,
          positions.get(edge.to) ?? -1,
        ]),
      };
    };

    expect([1, 2, 3, 4, 5].map(shapeOf)).toEqual([
      {
        nodes: 6,
        parents: [
          [0, 1],
          [1, 2],
          [0, 3],
          [1, 4],
          [0, 5],
        ],
      },
      {
        nodes: 7,
        parents: [
          [0, 1],
          [0, 2],
          [1, 3],
          [1, 4],
          [2, 5],
          [1, 6],
        ],
      },
      {
        nodes: 7,
        parents: [
          [0, 1],
          [1, 2],
          [0, 3],
          [2, 4],
          [4, 5],
          [5, 6],
        ],
      },
      {
        nodes: 10,
        parents: [
          [0, 1],
          [1, 2],
          [2, 3],
          [2, 4],
          [3, 5],
          [1, 6],
          [6, 7],
          [0, 8],
          [2, 9],
        ],
      },
      {
        nodes: 5,
        parents: [
          [0, 1],
          [1, 2],
          [0, 3],
          [3, 4],
        ],
      },
    ]);
  });

  it('changes nothing else a seeded run produces', () => {
    // The values are written after the parent index is drawn and never through
    // the draw, so a protocol whose edgeConfig names them must produce exactly
    // the network of one whose edgeConfig names none — same people, same
    // values, same parent for every child. Held against a later stage as well,
    // so a shifted stream shows up outside the pedigree too.
    const codebook = codebookWith(KIN_VARIABLES, {
      name: { name: 'Name', type: 'text' },
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 0, maxValue: 100 },
      },
    });

    for (let seed = 1; seed <= 25; seed++) {
      const run = (edgeConfig: Record<string, string>): GenerateParams =>
        ({
          seed,
          codebook,
          stages: [pedigree(edgeConfig), nameGenerator(3)],
        }) as GenerateParams;

      const written = generateNetwork(run(EDGE_CONFIG)).network;
      const bare = generateNetwork(run({ type: 'kin' })).network;

      // Compared by position rather than by uid: `uuid()` is not seeded, so
      // identity differs run to run while everything the generator draws does
      // not.
      expect(written.nodes.map(nodeShape)).toEqual(bare.nodes.map(nodeShape));
      expect(written.edges.map(edgeShape(written.nodes))).toEqual(
        bare.edges.map(edgeShape(bare.nodes)),
      );
      // The bare run is the "before" this change is measured against: it holds
      // the empty attributes every pedigree edge used to carry.
      expect(
        kinEdges(bare.edges).every((a) => Object.keys(a).length === 0),
      ).toBe(true);
    }
  });
});

/**
 * A written value is in the network without the `unique` registry having issued
 * it, so the registry has to be told, exactly as it is told about the ego flag
 * a pedigree pins on its own nodes. The hold is taken before the first stage
 * runs and never given back, so it covers the draws on both sides of the
 * pedigree — which is why nothing claims these values as well.
 */
describe('a pedigree edge value on a unique variable', () => {
  const uniqueActive = codebookWith({
    isActive: {
      name: 'isActive',
      type: 'boolean',
      validation: { unique: true },
    },
  });

  it(`is held back from an earlier stage's draw, over ${SEEDS} seeds`, () => {
    // The census runs first, so nothing the pedigree does can reach a draw that
    // has already happened: the flag has to be reserved before the first stage
    // runs, or the census edge is issued `true` from the first position of the
    // slot's sequence and the pedigree writes `true` on its own edge as well.
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: uniqueActive,
        stages: [nameGenerator(2), personCensus, pedigree(EDGE_CONFIG)],
        config: CERTAIN_EDGES,
      });

      const flags = kinEdges(network.edges).map((a) => a.isActive);
      if (flags.length !== 2 || new Set(flags).size !== 2) {
        failures.push(`seed ${seed}: ${JSON.stringify(flags)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it(`is held back from a later stage's draw too, over ${SEEDS} seeds`, () => {
    // And the other direction: the pedigree runs first, and the hold is still
    // standing when the census draws, because nothing ever gives it back. That
    // is what makes claiming these values as well unnecessary.
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: uniqueActive,
        stages: [pedigree(EDGE_CONFIG), nameGenerator(2), personCensus],
        config: CERTAIN_EDGES,
      });

      const flags = kinEdges(network.edges).map((a) => a.isActive);
      if (flags.length !== 2 || new Set(flags).size !== 2) {
        failures.push(`seed ${seed}: ${JSON.stringify(flags)}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
