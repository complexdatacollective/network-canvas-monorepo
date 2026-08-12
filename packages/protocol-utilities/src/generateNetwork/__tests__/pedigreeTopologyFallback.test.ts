import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  type DyadCensusMetadataItem,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * A FamilyPedigree builds its people during the session walk rather than in the
 * plan, so a later census over them has no planned domain and the walk applies
 * the declared topology itself. That fallback has to behave like the plan it
 * stands in for: one target per edge type however many interactions create it,
 * and edges it makes have to reach the census answers that describe them.
 */

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const codebook = (): Codebook =>
  ({
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: {
          name: { name: 'Name', type: 'text' },
          isEgo: { name: 'Is ego', type: 'boolean' },
          relationship: { name: 'Relationship', type: 'text' },
          sex: { name: 'Sex', type: 'text' },
        },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        variables: {},
      },
    },
  }) as unknown as Codebook;

const pedigree = {
  id: 'stage-pedigree',
  type: 'FamilyPedigree',
  label: 'Family',
  nodeConfig: {
    type: 'person',
    nodeLabelVariable: 'name',
    egoVariable: 'isEgo',
    relationshipVariable: 'relationship',
    biologicalSexVariable: 'sex',
  },
  edgeConfig: {
    type: 'relation',
    relationshipTypeVariable: 'relType',
    isActiveVariable: 'isActive',
    isGestationalCarrierVariable: 'carrier',
    gameteRoleVariable: 'gamete',
  },
  framing: { mode: 'fixed', value: 'gendered' },
  boundaries: {
    requireGrandparents: 'off',
    requireChildrenContributors: 'off',
  },
  censusPrompt: 'Add your family.',
} as unknown as Stage;

const densityTopology = (value: number) => ({
  topology: {
    metric: 'density',
    distribution: { distribution: 'constant', value },
  },
});

const meanDegreeTopology = (value: number) => ({
  topology: {
    metric: 'meanDegree',
    distribution: { distribution: 'constant', value },
  },
});

const census = (
  promptCount: number,
  topology: Record<string, unknown> = densityTopology(0.5),
): Stage =>
  ({
    id: 'stage-census',
    type: 'DyadCensus',
    label: 'Who knows whom',
    subject: { entity: 'node', type: 'person' },
    synthetic: topology,
    prompts: Array.from({ length: promptCount }, (_, index) => ({
      id: `p${index + 1}`,
      text: 'Do they know each other?',
      createEdge: 'knows',
    })),
  }) as unknown as Stage;

const pairKey = (a: string, b: string) => (a < b ? `${a} ${b}` : `${b} ${a}`);

describe('a census over a family the plan could not size', () => {
  it('applies one topology target however many prompts create the edge', () => {
    // Each prompt reaches the fallback. Measuring a fresh target against
    // whatever the previous prompt left unlinked applies the declared density
    // twice — two passes at 0.5 leaving roughly 0.75 — so the count has to be
    // the same whether one interaction creates the type or several.
    for (let seed = 1; seed <= 12; seed++) {
      const options = { seed, codebook: codebook() };
      const { network: onePrompt } = generateNetwork({
        ...options,
        stages: [pedigree, census(1)],
      });
      const { network: twoPrompts } = generateNetwork({
        ...options,
        stages: [pedigree, census(2)],
      });

      const knows = (network: { edges: { type: string }[] }) =>
        network.edges.filter((edge) => edge.type === 'knows').length;

      expect(knows(twoPrompts)).toBe(knows(onePrompt));
    }
  });

  it('never calls a pair unlinked while carrying an edge between them', () => {
    // Census answers read final membership, which the plan seeds from its own
    // edges. An edge the walk added and did not record there is reported as an
    // explicit negative nomination — a session saying both that these two are
    // linked and that they are not.
    for (let seed = 1; seed <= 12; seed++) {
      const { network, stageMetadata } = generateNetwork({
        seed,
        codebook: codebook(),
        stages: [pedigree, census(1)],
      });

      const linked = new Set(
        network.edges
          .filter((edge) => edge.type === 'knows')
          .map((edge) => pairKey(edge.from, edge.to)),
      );
      const tuples = (stageMetadata?.[1] ?? []) as DyadCensusMetadataItem[];

      expect(network.nodes.length).toBeGreaterThan(1);
      for (const [, a, b, answered] of tuples) {
        if (!answered) expect(linked.has(pairKey(a, b))).toBe(false);
      }
      // And the negatives are actually being exercised, so the assertion above
      // is not vacuous.
      expect(tuples.length).toBeGreaterThan(0);
      expect(
        network.nodes.map((node) => node[entityPrimaryKeyProperty]).length,
      ).toBe(network.nodes.length);
    }
  });
});

describe('a mean-degree topology split across planned and pedigree people', () => {
  const meanDegreeCodebook = (): Codebook =>
    ({
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: {
            name: { name: 'Name', type: 'text' },
            isEgo: { name: 'Is ego', type: 'boolean' },
            relationship: { name: 'Relationship', type: 'text' },
            sex: { name: 'Sex', type: 'text' },
          },
        },
      },
      edge: {
        knows: {
          name: 'Knows',
          color: 'edge-color-seq-1',
          variables: {},
        },
      },
    }) as unknown as Codebook;

  const namePeople = {
    id: 'stage-people',
    type: 'NameGeneratorQuickAdd',
    label: 'Names',
    subject: { entity: 'node', type: 'person' },
    quickAdd: 'name',
    prompts: [{ id: 'p1', text: 'Who?' }],
    behaviours: { minNodes: 4, maxNodes: 4 },
  } as unknown as Stage;

  it('does not exceed the declared degree over the whole graph', () => {
    // Mean degree is a property of a graph, not of a subset. The plan emits
    // its share over the people it owns; a fallback that then targets its own
    // partition independently adds a second share, and the finished network
    // is connected far past what was declared.
    const declaredDegree = 2;

    for (let seed = 1; seed <= 12; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: meanDegreeCodebook(),
        stages: [
          namePeople,
          pedigree,
          census(1, meanDegreeTopology(declaredDegree)),
        ],
      });

      const people = network.nodes.filter((node) => node.type === 'person');
      const knows = network.edges.filter((edge) => edge.type === 'knows');
      const allowed = Math.round((declaredDegree * people.length) / 2);

      expect(knows.length).toBeLessThanOrEqual(allowed);
    }
  });
});

describe('a composer edge form over a pedigree', () => {
  it('honours a declared missingness on a field it is the only writer of', () => {
    // The edge is built during the walk, over people the plan never held, so
    // nothing about it comes from the plan — the value and the missingness
    // decision are both taken here.
    const withMissingField = {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: {
            name: { name: 'Name', type: 'text' },
            isEgo: { name: 'Is ego', type: 'boolean' },
            relationship: { name: 'Relationship', type: 'text' },
            sex: { name: 'Sex', type: 'text' },
          },
        },
      },
      edge: {
        knows: {
          name: 'Knows',
          color: 'edge-color-seq-1',
          variables: {
            since: {
              name: 'Since',
              type: 'text',
              synthetic: { missingProbability: 1 },
            },
          },
        },
      },
    } as unknown as Codebook;

    const composer = {
      id: 'stage-composer',
      type: 'NetworkComposer',
      label: 'Compose',
      subject: { entity: 'node', type: 'person' },
      edges: [
        {
          subject: { entity: 'edge', type: 'knows' },
          form: { fields: [{ variable: 'since', prompt: 'Since when?' }] },
        },
      ],
    } as unknown as Stage;

    for (let seed = 1; seed <= 8; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: withMissingField,
        stages: [pedigree, composer],
      });

      const knows = network.edges.filter((edge) => edge.type === 'knows');
      expect(knows.length).toBeGreaterThan(0);
      for (const edge of knows) {
        const value = (
          edge as unknown as { attributes: Record<string, unknown> }
        ).attributes.since;
        expect(value ?? null).toBeNull();
      }
    }
  });
});

describe('two walk-time creators whose subject sets overlap', () => {
  it('targets the union of their domains, not each in turn', () => {
    // Neither census's subject set contains the other's, so a target measured
    // over each in turn is a target over neither: the first spends its share
    // on its own pairs, and the second re-measures against a domain that never
    // includes the pairs only the first could see.
    const density = 0.5;
    const overlapping = {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: {
            name: { name: 'Name', type: 'text' },
            isEgo: { name: 'Is ego', type: 'boolean' },
            relationship: { name: 'Relationship', type: 'text' },
            sex: { name: 'Sex', type: 'text' },
          },
        },
      },
      edge: {
        knows: {
          name: 'Knows',
          color: 'edge-color-seq-1',
          variables: {},
          synthetic: {
            metric: 'density',
            topology: {
              metric: 'density',
              distribution: { distribution: 'constant', value: density },
            },
          },
        },
      },
    } as unknown as Codebook;

    const censusExcluding = (id: string, relationship: string): Stage =>
      ({
        id,
        type: 'DyadCensus',
        label: 'Who knows whom',
        subject: { entity: 'node', type: 'person' },
        synthetic: densityTopology(0.5),
        prompts: [{ id: `${id}-p1`, text: 'Which?', createEdge: 'knows' }],
        filter: {
          join: 'AND',
          rules: [
            {
              id: `${id}-r1`,
              type: 'node',
              options: {
                type: 'person',
                attribute: 'relationship',
                operator: 'NOT',
                value: relationship,
              },
            },
          ],
        },
      }) as unknown as Stage;

    for (let seed = 1; seed <= 10; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: overlapping,
        stages: [
          pedigree,
          censusExcluding('census-a', 'Parent'),
          censusExcluding('census-b', 'Sibling'),
        ],
        respectSkipLogicAndFiltering: true,
      });

      const people = network.nodes.filter((node) => node.type === 'person');
      const relationshipOf = (uid: string) =>
        people.find((node) => node[entityPrimaryKeyProperty] === uid)?.[
          'attributes' as never
        ] as unknown as Record<string, unknown> | undefined;

      const pairsOf = (excluded: string) => {
        const set = people.filter(
          (node) =>
            (relationshipOf(node[entityPrimaryKeyProperty])?.relationship ??
              null) !== excluded,
        );
        const keys = new Set<string>();
        for (let a = 0; a < set.length; a++) {
          for (let b = a + 1; b < set.length; b++) {
            keys.add(
              pairKey(
                set[a]![entityPrimaryKeyProperty],
                set[b]![entityPrimaryKeyProperty],
              ),
            );
          }
        }
        return keys;
      };

      const union = new Set([...pairsOf('Parent'), ...pairsOf('Sibling')]);
      const knows = network.edges.filter((edge) => edge.type === 'knows');

      expect(union.size).toBeGreaterThan(0);
      expect(knows).toHaveLength(Math.round(density * union.size));
    }
  });
});

describe('one edge type created over two subject types', () => {
  // A pair is two nodes of ONE type, so creators over different types reach
  // disjoint pairs and must be measured apart. Keyed on the edge type alone,
  // the place creator's pairs entered the domain the person creator's target
  // was measured over — and its planned edge was subtracted from that target —
  // so the person census made fewer edges than its own declared density asks.
  const twoSubjects = (): Codebook =>
    ({
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: {
            name: { name: 'Name', type: 'text' },
            isEgo: { name: 'Is ego', type: 'boolean' },
            relationship: { name: 'Relationship', type: 'text' },
            sex: { name: 'Sex', type: 'text' },
          },
        },
        place: {
          name: 'Place',
          color: 'node-color-seq-2',
          variables: { label: { name: 'Label', type: 'text' } },
        },
      },
      edge: {
        knows: { name: 'Knows', color: 'edge-color-seq-1', variables: {} },
      },
    }) as unknown as Codebook;

  const places = {
    id: 'stage-places',
    type: 'NameGeneratorQuickAdd',
    label: 'Places',
    subject: { entity: 'node', type: 'place' },
    quickAdd: 'label',
    synthetic: { count: { distribution: 'constant', value: 3 } },
    prompts: [{ id: 'p1', text: 'Where?' }],
  } as unknown as Stage;

  const placeCensus = {
    id: 'stage-place-census',
    type: 'DyadCensus',
    label: 'Which places go together',
    subject: { entity: 'node', type: 'place' },
    synthetic: densityTopology(1),
    prompts: [{ id: 'p1', text: 'Together?', createEdge: 'knows' }],
  } as unknown as Stage;

  const personEdgesOf = (stages: Stage[]): number => {
    const { network } = generateNetwork({
      seed: 5,
      codebook: twoSubjects(),
      stages,
    });
    const people = new Set(
      network.nodes
        .filter((node) => node.type === 'person')
        .map((node) => node[entityPrimaryKeyProperty]),
    );
    return network.edges.filter(
      (edge) =>
        edge.type === 'knows' && people.has(edge.from) && people.has(edge.to),
    ).length;
  };

  it('leaves the person topology alone whatever the place creator does', () => {
    const withoutPlaces = personEdgesOf([pedigree, census(1)]);
    const withPlaces = personEdgesOf([
      pedigree,
      places,
      placeCensus,
      census(1),
    ]);

    expect(withoutPlaces).toBeGreaterThan(0);
    expect(withPlaces).toBe(withoutPlaces);
  });
});

describe('a walk-time domain larger than a preview can pair', () => {
  it('refuses it rather than assembling the keys', () => {
    // The plan's ceiling never sees these people: a FamilyPedigree builds them
    // during the walk, so this domain is assembled separately and was bounded
    // by nothing. `maxNodes` is a caller option, and a raised one reaches a
    // domain of millions of keys on Architect's main thread.
    // Each pedigree builds a family of its own natural size — a raised
    // `maxNodes` is a ceiling rather than a target — so it is the accumulation
    // that reaches the cap, which is the other route the protocol schema
    // leaves open.
    const manyPedigrees = Array.from(
      { length: 30 },
      (_unused, index) =>
        ({ ...pedigree, id: `stage-pedigree-${index}` }) as unknown as Stage,
    );

    expect(() =>
      generateNetwork({
        seed: 3,
        codebook: codebook(),
        stages: [...manyPedigrees, census(1)],
      }),
    ).toThrow(/more pairs than a preview can build/);
  });

  it('measures the union rather than the sum of overlapping creators', () => {
    // Two prompts over the same people see the same pairs. Summing their sizes
    // before merging counts every shared pair twice, so a domain comfortably
    // inside the cap was refused on the second pass — which would add no
    // entries at all.
    // Enough people that the domain sits between half the cap and the cap:
    // one pass fits, two summed do not, and the union is one pass.
    const manyPedigrees = Array.from(
      { length: 22 },
      (_unused, index) =>
        ({ ...pedigree, id: `stage-pedigree-${index}` }) as unknown as Stage,
    );

    const { network } = generateNetwork({
      seed: 3,
      codebook: codebook(),
      // Three prompts, one subject set: 3x the pairs if summed, 1x if merged.
      stages: [...manyPedigrees, census(3)],
    });
    expect(network.nodes.length).toBeGreaterThan(400);
  });

  it('builds a walk-time domain that fits', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook: codebook(),
      stages: [pedigree, census(1)],
    });
    expect(network.nodes.length).toBeGreaterThan(0);
  });
});

describe('a pedigree field declaring missingness', () => {
  it('leaves it unanswered on every relative', () => {
    // A family's people are drawn by the specialist generator rather than by
    // the plan, so neither the plan's missingness pass nor the walk's reached
    // them: a label declaring `missingProbability: 1` stayed populated on
    // every relative while the protocol said it never would be.
    const withMissingLabel = {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: {
            name: {
              name: 'Name',
              type: 'text',
              synthetic: { generator: 'personName', missingProbability: 1 },
            },
            isEgo: { name: 'Is ego', type: 'boolean' },
            relationship: { name: 'Relationship', type: 'text' },
            sex: { name: 'Sex', type: 'text' },
          },
        },
      },
      edge: {
        knows: { name: 'Knows', color: 'edge-color-seq-1', variables: {} },
      },
    } as unknown as Codebook;

    const { network } = generateNetwork({
      seed: 4,
      codebook: withMissingLabel,
      stages: [pedigree],
    });

    expect(network.nodes.length).toBeGreaterThan(1);
    // Unanswered, whether that shows as a null the draw wrote or as an
    // attribute the pedigree never asks ego for at all.
    for (const node of network.nodes) {
      expect(node[entityAttributesProperty].name ?? null).toBeNull();
    }
  });

  it('still answers a field that declares none', () => {
    const { network } = generateNetwork({
      seed: 4,
      codebook: codebook(),
      stages: [pedigree],
    });

    expect(network.nodes.length).toBeGreaterThan(1);
    expect(
      network.nodes.some(
        (node) => node[entityAttributesProperty].name !== null,
      ),
    ).toBe(true);
  });
});
