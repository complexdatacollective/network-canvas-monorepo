import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

/**
 * Two variables the codebook declares equal, one of which is sometimes left
 * unanswered. `sameAs` is enforced by the runtime's validator, so a session
 * holding one of them null beside a populated sibling is one no participant
 * could have submitted.
 */
function tiedCodebook(
  missingProbability: number,
  echoValidation: Record<string, unknown> = {},
): Codebook {
  return {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        synthetic: { count: { distribution: 'constant', value: 6 } },
        variables: {
          answer: {
            name: 'Answer',
            type: 'boolean',
            synthetic: { missingProbability },
          },
          echo: {
            name: 'Echo',
            type: 'boolean',
            validation: { sameAs: 'answer', ...echoValidation },
          },
        },
      },
    },
    edge: {},
  } as unknown as Codebook;
}

function collectingGenerator(...variables: string[]): Stage {
  return {
    id: 'stage-people',
    type: 'NameGenerator',
    label: 'People',
    subject: { entity: 'node', type: 'person' },
    form: {
      title: 'About this person',
      fields: variables.map((variable) => ({ variable, prompt: variable })),
    },
    prompts: [{ id: 'p1', text: 'Name people' }],
  } as unknown as Stage;
}

describe('missingness across a sameAs group', () => {
  it('leaves both members unanswered rather than splitting the pair', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: tiedCodebook(1),
        stages: [collectingGenerator('answer', 'echo')],
      });

      expect(network.nodes.length, `seed ${seed}`).toBeGreaterThan(0);
      for (const node of network.nodes) {
        const attributes = node[entityAttributesProperty];
        expect(attributes.answer, `seed ${seed}`).toBeNull();
        expect(attributes.echo, `seed ${seed}`).toBeNull();
      }
    }
  });

  it('keeps the pair equal when nothing is declared missing', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: tiedCodebook(0),
        stages: [collectingGenerator('answer', 'echo')],
      });

      for (const node of network.nodes) {
        const attributes = node[entityAttributesProperty];
        expect(attributes.answer, `seed ${seed}`).not.toBeNull();
        expect(attributes.echo, `seed ${seed}`).toEqual(attributes.answer);
      }
    }
  });

  it('answers the group when a member is required', () => {
    // The schema rejects missingness only on the variable that declares it, so
    // an optional variable may carry a probability while the variable it is
    // tied to is required. Nulling the group would then emit a session whose
    // required field is empty — something the runtime's own validator refuses,
    // and so something no participant could have submitted either.
    for (let seed = 1; seed <= 20; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: tiedCodebook(1, { required: true }),
        stages: [collectingGenerator('answer', 'echo')],
      });

      expect(network.nodes.length, `seed ${seed}`).toBeGreaterThan(0);
      for (const node of network.nodes) {
        const attributes = node[entityAttributesProperty];
        expect(attributes.echo, `seed ${seed}`).not.toBeNull();
        expect(attributes.answer, `seed ${seed}`).toEqual(attributes.echo);
      }
    }
  });
});

describe('edges whose endpoints a skip passed over', () => {
  const codebook = {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        synthetic: { count: { distribution: 'constant', value: 4 } },
        variables: { name: { name: 'Name', type: 'text' } },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        // Every eligible pair, so an endpoint the session never introduced
        // cannot be missed by chance.
        synthetic: {
          topology: {
            metric: 'density',
            distribution: { distribution: 'constant', value: 1 },
          },
        },
        variables: {},
      },
    },
    ego: {
      variables: {
        consent: {
          name: 'Consent',
          type: 'boolean',
          synthetic: { probabilityTrue: 0 },
        },
      },
    },
  } as unknown as Codebook;

  const egoForm = {
    id: 'stage-consent',
    type: 'EgoForm',
    label: 'Consent',
    introductionPanel: { title: 'Consent', text: 'Consent' },
    form: { fields: [{ variable: 'consent', prompt: 'Do you consent?' }] },
  } as unknown as Stage;

  const generator = (id: string, skipped: boolean): Stage =>
    ({
      id,
      type: 'NameGenerator',
      label: id,
      subject: { entity: 'node', type: 'person' },
      form: { title: 'About', fields: [{ variable: 'name', prompt: 'Name' }] },
      prompts: [{ id: `${id}-p1`, text: 'Name people' }],
      behaviours: { minNodes: 2, maxNodes: 2 },
      ...(skipped
        ? {
            skipLogic: {
              action: 'SKIP',
              filter: {
                rules: [
                  {
                    id: 'no-consent',
                    type: 'ego',
                    options: {
                      attribute: 'consent',
                      operator: 'EXACTLY',
                      value: false,
                    },
                  },
                ],
              },
            },
          }
        : {}),
    }) as unknown as Stage;

  const census = {
    id: 'stage-census',
    type: 'DyadCensus',
    label: 'Census',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      { id: 'c1', text: 'Do they know each other?', createEdge: 'knows' },
    ],
  } as unknown as Stage;

  const stages = [
    egoForm,
    generator('present', false),
    generator('bypassed', true),
    census,
  ];

  /**
   * The plan sizes a population from the codebook and cannot know which
   * creating stages a session will reach. An edge planned onto people a
   * skipped stage would have introduced has to be dropped rather than
   * materialised, or the network holds an edge dangling from ids no node
   * carries — something no export or query could make sense of.
   */
  it('never materialises an edge dangling from a node the session skipped', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages,
        respectSkipLogicAndFiltering: true,
      });

      const present = new Set(
        network.nodes.map((node) => node[entityPrimaryKeyProperty]),
      );
      expect(network.nodes, `seed ${seed}`).toHaveLength(2);
      for (const edge of network.edges) {
        expect(present.has(edge.from), `seed ${seed}`).toBe(true);
        expect(present.has(edge.to), `seed ${seed}`).toBe(true);
      }
    }
  });

  it('still builds the whole population when the skip does not fire', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages,
      respectSkipLogicAndFiltering: false,
    });

    const present = new Set(
      network.nodes.map((node) => node[entityPrimaryKeyProperty]),
    );
    expect(network.nodes).toHaveLength(4);
    expect(network.edges.length).toBeGreaterThan(0);
    for (const edge of network.edges) {
      expect(present.has(edge.from)).toBe(true);
      expect(present.has(edge.to)).toBe(true);
    }
  });
});
