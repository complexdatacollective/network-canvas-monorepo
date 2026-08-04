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
/**
 * Every edge a pedigree creates is either a parent-child link or a partnership,
 * and the interview writes the whole of its `edgeConfig` onto each: the
 * relationship type, the active flag, and — for a genetic parent — which gamete
 * they supplied and whether they carried the pregnancy.
 *
 * The generator used to write only the first two, and to build a single-parent
 * tree with no partnerships at all, so nothing reading pedigree data could tell
 * how anything was transmitted.
 */
describe('the values a pedigree writes onto its edges', () => {
  const network = (seed: number) =>
    generateNetwork({
      codebook: codebookWith(KIN_VARIABLES),
      stages: [pedigree(EDGE_CONFIG)],
      seed,
    }).network;

  it(`records a relationship type and an active flag on every edge, over ${SEEDS} seeds`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const attributes = kinEdges(network(seed).edges);
      expect(attributes.length, `seed ${seed}`).toBeGreaterThan(0);
      for (const attrs of attributes) {
        expect(attrs.relationshipType, `seed ${seed}`).toBeDefined();
        expect(typeof attrs.isActive, `seed ${seed}`).toBe('boolean');
      }
    }
  });

  it('writes a gamete role on genetic parentage and never on a partnership', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      for (const attrs of kinEdges(network(seed).edges)) {
        const type = JSON.stringify(attrs.relationshipType);
        if (type === '["biological"]' || type === '["donor"]') {
          expect(attrs.gameteRole, `seed ${seed}`).toBeDefined();
        }
        if (type === '["partner"]') {
          expect(attrs.gameteRole, `seed ${seed}`).toBeUndefined();
        }
      }
    }
  });

  it('builds partnerships, which a single-parent tree never had', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const partners = kinEdges(network(seed).edges).filter(
        (attrs) => JSON.stringify(attrs.relationshipType) === '["partner"]',
      );
      expect(partners.length, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it('writes values the edge type’s own codebook accepts', () => {
    const constraints = buildEntityConstraints(KIN_VARIABLES, '2024-01-01');
    for (let seed = 1; seed <= SEEDS; seed++) {
      for (const attrs of kinEdges(network(seed).edges)) {
        expect(
          ruleBrokenByFixedValues(constraints, attrs),
          `seed ${seed}: ${JSON.stringify(attrs)}`,
        ).toBeUndefined();
      }
    }
  });

  it('gives every edge its own attribute object', () => {
    const attributes = kinEdges(network(1).edges);
    expect(attributes.length).toBeGreaterThan(1);
    const [first, second] = attributes;
    expect(first).not.toBe(second);
  });

  it('is deterministic for a given seed', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const a = network(seed);
      const b = network(seed);
      expect(a.nodes.map(nodeShape)).toEqual(b.nodes.map(nodeShape));
      expect(a.edges.map(edgeShape(a.nodes))).toEqual(
        b.edges.map(edgeShape(b.nodes)),
      );
    }
  });
});
