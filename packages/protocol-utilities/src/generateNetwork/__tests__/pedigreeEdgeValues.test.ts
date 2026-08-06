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
  options: {
    personVariables?: Record<string, unknown>;
    /** Declared family size; the pedigree builds one edge per node after the first. */
    relativeCount?: number;
  } = {},
): Codebook {
  return {
    node: {
      relative: {
        name: 'Relative',
        color: 'node-color-seq-1',
        synthetic: {
          count: {
            distribution: 'constant',
            value: options.relativeCount ?? 4,
          },
        },
        variables: {
          name: { name: 'Name', type: 'text' },
          isEgo: { name: 'Is ego', type: 'boolean' },
          relationship: { name: 'Relationship', type: 'text' },
          sex: { name: 'Sex', type: 'text' },
        },
      },
      person: {
        name: 'Person',
        color: 'node-color-seq-2',
        variables: options.personVariables ?? {},
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

function pedigree(): Stage {
  return {
    id: 'stage-pedigree',
    type: 'FamilyPedigree',
    label: 'Family',
    nodeConfig: {
      type: 'relative',
      nodeLabelVariable: 'name',
      egoVariable: 'isEgo',
      relationshipVariable: 'relationship',
      biologicalSexVariable: 'sex',
    },
    edgeConfig: EDGE_CONFIG,
    framing: { mode: 'fixed', value: 'gendered' },
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    },
    censusPrompt: 'Add your family.',
  } as unknown as Stage;
}

function nameGenerator(nodes: number, ...fields: string[]): Stage {
  return {
    id: 'stage-ng',
    type: 'NameGenerator',
    label: 'People',
    subject: { entity: 'node', type: 'person' },
    form: {
      title: 'About this person',
      fields: fields.map((variable) => ({ variable, prompt: variable })),
    },
    prompts: [{ id: 'p1', text: 'Name people' }],
    behaviours: { minNodes: nodes, maxNodes: nodes },
  } as unknown as Stage;
}

function kinEdges(edges: NcEdge[]): Record<string, VariableValue>[] {
  return edges
    .filter((edge) => edge.type === 'kin')
    .map((edge) => edge[entityAttributesProperty]);
}

/**
 * Every edge the pedigree plans is a parent-child link, and the interview
 * writes a relationship type and an active flag onto every parent-child edge
 * it commits — `buildChildParentage`, `egoCellTransform`,
 * `siblingCellTransform`, `buildParentageBatch`, `AddParentWizard` and
 * `PedigreeView` all do. The analyser's `pedigreeEdgeFixedValues` is that
 * write, and a materialised pedigree edge carries exactly it.
 */
describe('the values a pedigree writes onto its edges', () => {
  it(`records a biological, active parentage on every edge, over ${SEEDS} seeds`, () => {
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: codebookWith(KIN_VARIABLES),
        stages: [pedigree()],
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
      stages: [pedigree()],
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
      stages: [pedigree()],
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
      stages: [pedigree()],
    });

    const edges = network.edges.filter((edge) => edge.type === 'kin');
    expect(edges.length).toBeGreaterThan(1);
    edges[0]![entityAttributesProperty].isActive = false;
    expect(edges[1]![entityAttributesProperty].isActive).toBe(true);
  });
});

describe('what the pedigree edge values cost the run', () => {
  /** Everything about a node except the unseeded uid it was given. */
  const nodeShape = (node: NcNode): Record<string, unknown> => {
    const { [entityPrimaryKeyProperty]: _uid, ...rest } = node;
    return rest;
  };

  /** An edge read as endpoint positions in the node list, type included. */
  const edgeShape =
    (nodes: NcNode[]) =>
    (edge: NcEdge): Record<string, unknown> => {
      const positions = new Map(
        nodes.map((node, index) => [node[entityPrimaryKeyProperty], index]),
      );
      return {
        type: edge.type,
        from: positions.get(edge.from),
        to: positions.get(edge.to),
      };
    };

  it('changes nothing else a seeded run produces', () => {
    // The values are written rather than drawn, and every free draw runs on
    // its own per-variable substream — so declaring the kin variables the
    // pedigree writes must leave every node, every parent choice, and every
    // draw of a later stage exactly where the same seed put them without
    // those declarations. Only the edges' own written attributes may differ.
    const personVariables = {
      name: { name: 'Name', type: 'text' },
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 0, maxValue: 100 },
      },
    };

    for (let seed = 1; seed <= 25; seed++) {
      const run = (kinVariables: Record<string, unknown>): GenerateParams =>
        ({
          seed,
          codebook: codebookWith(kinVariables, { personVariables }),
          stages: [pedigree(), nameGenerator(3, 'name', 'age')],
        }) as GenerateParams;

      const written = generateNetwork(run(KIN_VARIABLES)).network;
      const bare = generateNetwork(run({})).network;

      // Compared by position rather than by uid: entity ids are not seeded, so
      // identity differs run to run while everything the generator draws does
      // not.
      expect(written.nodes.map(nodeShape)).toEqual(bare.nodes.map(nodeShape));
      expect(written.edges.map(edgeShape(written.nodes))).toEqual(
        bare.edges.map(edgeShape(bare.nodes)),
      );
      // The write comes from the stage's own edgeConfig rather than from the
      // codebook declarations, so the bare run's edges carry exactly the same
      // two values — which is why declaring the variables can cost nothing.
      expect(
        kinEdges(bare.edges).every(
          (attributes) =>
            JSON.stringify(attributes.relationshipType) === '["biological"]' &&
            attributes.isActive === true &&
            Object.keys(attributes).length === 2,
        ),
      ).toBe(true);
    }
  });
});

/**
 * A written value is in the network without the `unique` registry having issued
 * it, so it is either claimed (a single pedigree edge) or refused up front
 * (a family whose tree would pin one value on two edges) — never left for a
 * draw to duplicate.
 */
describe('a pedigree edge value on a unique variable', () => {
  const uniqueActive = (relativeCount: number): Codebook =>
    codebookWith(
      {
        isActive: {
          name: 'isActive',
          type: 'boolean',
          validation: { unique: true },
        },
      },
      { relativeCount },
    );

  it('is refused up front where the family would pin it twice', () => {
    // Three family members build two parent-child edges, and the pedigree
    // writes `isActive: true` onto both — a duplicate no seed can avoid, so
    // the refusal names the pedigree's own writer before anything is drawn.
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook: uniqueActive(3),
        stages: [pedigree()],
      }),
    ).toThrow(
      /a family pedigree fixes this to true on up to 2 edges, but unique allows one edge to hold a value/,
    );
  });

  it(`is claimed for the one edge a two-person family builds, over ${SEEDS} seeds`, () => {
    // One parent-child edge is inside what `unique` allows, so the protocol
    // generates — and the flag is written as the claim the registry holds for
    // the rest of the run, exactly as the proband's ego flag is.
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: uniqueActive(2),
        stages: [pedigree()],
      });

      const flags = kinEdges(network.edges).map(
        (attributes) => attributes.isActive,
      );
      if (flags.length !== 1 || flags[0] !== true) {
        failures.push(`seed ${seed}: ${JSON.stringify(flags)}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
