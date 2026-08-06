import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const SEEDS = 500;

/**
 * One pedigree node plus one node from the other stage: the planner apportions
 * the type's declared population across its creating stages after honouring
 * every stage minimum, and the pedigree's own minimum is the proband.
 */
function personCodebook(
  count: number,
  variables: Record<string, unknown>,
): Codebook {
  return {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        synthetic: { count: { distribution: 'constant', value: count } },
        variables,
      },
    },
    edge: { family: { name: 'F', color: 'edge-color-seq-1', variables: {} } },
  } as unknown as Codebook;
}

function pedigree(): Stage {
  return {
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
      type: 'family',
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
}

/** A name generator whose form writes the flag onto the people it creates. */
function flagWritingGenerator(nodes: number): Stage {
  return {
    id: 'stage-ng',
    type: 'NameGenerator',
    label: 'More people',
    subject: { entity: 'node', type: 'person' },
    form: { title: 'About', fields: [{ variable: 'isEgo', prompt: 'Ego?' }] },
    prompts: [{ id: 'p1', text: 'Name people' }],
    behaviours: { minNodes: nodes, maxNodes: nodes },
  } as unknown as Stage;
}

const BASE_VARIABLES = {
  name: { name: 'Name', type: 'text' },
  relationship: { name: 'Relationship', type: 'text' },
  sex: { name: 'Sex', type: 'text' },
};

function describeNodes(nodes: NcNode[]): string {
  return JSON.stringify(
    nodes.map((node) => ({
      stageId: node.stageId,
      ...node[entityAttributesProperty],
    })),
  );
}

/**
 * A FamilyPedigree stage writes its ego flag itself — the runtime's
 * `egoCellTransform` sets it true on the proband and explicitly false on
 * everybody else — so on a `unique` variable that flag is a value spoken for
 * by the protocol rather than drawn from the registry. The planner claims it
 * as the pedigree's nodes are planned, and every later draw and roster
 * judgement of the same slot is measured against that claim.
 */
describe('a pedigree ego flag on a unique variable', () => {
  const uniqueFlagVariables = {
    ...BASE_VARIABLES,
    isEgo: { name: 'Is ego', type: 'boolean', validation: { unique: true } },
  };

  it(`is claimed against a later stage's draw, over ${SEEDS} seeds`, () => {
    // The name generator's form draws the flag onto its own person, and the
    // proband's `true` is already claimed by the time that draw happens — so
    // the drawn flag is `false` on every seed, never a duplicate `true`.
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: personCodebook(1, uniqueFlagVariables),
        stages: [pedigree(), flagWritingGenerator(1)],
      });

      const flags = network.nodes.map(
        (node) => node[entityAttributesProperty].isEgo,
      );
      if (
        flags.length !== 2 ||
        new Set(flags.map((flag) => JSON.stringify(flag))).size !== 2
      ) {
        failures.push(`seed ${seed}: ${describeNodes(network.nodes)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it(`is recorded against a roster row carrying it, over ${SEEDS} seeds`, () => {
    // A roster row's value is the researcher's rather than the registry's, and
    // a row offering a value the network already holds is passed over — judged
    // by asking the registry whether that value is taken. So the proband's flag
    // has to be claimed and not merely noted: the row carrying `true` would
    // otherwise be drawn alongside the proband already holding it.
    const rows = [true, false].map(
      (isEgo, index) =>
        ({
          [entityPrimaryKeyProperty]: `roster-${index}`,
          type: 'person',
          [entityAttributesProperty]: { name: `Row ${index}`, isEgo },
        }) as unknown as NcNode,
    );
    const roster = {
      id: 'stage-roster',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: { entity: 'node', type: 'person' },
      dataSource: 'people.csv',
      prompts: [{ id: 'p1', text: 'Pick people' }],
      behaviours: { minNodes: 1, maxNodes: 1 },
    } as unknown as Stage;
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: personCodebook(1, uniqueFlagVariables),
        stages: [pedigree(), roster],
        externalData: { 'stage-roster': rows.map((row) => ({ ...row })) },
      });

      const flags = network.nodes.map(
        (node) => node[entityAttributesProperty].isEgo,
      );
      if (
        flags.length !== 2 ||
        new Set(flags.map((flag) => JSON.stringify(flag))).size !== 2
      ) {
        failures.push(`seed ${seed}: ${describeNodes(network.nodes)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('is refused up front where the family would pin `false` twice', () => {
    // Three family members hold one `true` and two `false`s, and no seed can
    // spread a written value over fewer holders — so the contradiction is
    // reported before anything is drawn, naming the pedigree's own writer,
    // rather than surfacing as a duplicate in the finished network.
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook: personCodebook(3, uniqueFlagVariables),
        stages: [pedigree()],
      }),
    ).toThrow(
      /a family pedigree fixes this to false on up to 2 nodes, but unique allows one node to hold a value/,
    );
  });
});

describe('a pedigree ego flag nothing reads', () => {
  it('perturbs nothing an unrelated variable draws', () => {
    // The flag is written rather than drawn, and every free draw runs on its
    // own per-variable substream — so a `unique` variable elsewhere on the
    // same type changes nothing about the people the pedigree builds. Held
    // against the same protocol without that variable, where everything but
    // the extra attribute itself must be identical.
    const variables = {
      ...BASE_VARIABLES,
      isEgo: { name: 'Is ego', type: 'boolean' },
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 0, maxValue: 100 },
      },
    };
    const withRef = {
      ...variables,
      ref: { name: 'Ref', type: 'text', validation: { unique: true } },
    };

    for (let seed = 1; seed <= 25; seed++) {
      const plain = generateNetwork({
        seed,
        codebook: personCodebook(4, variables),
        stages: [pedigree()],
      }).network.nodes;

      const augmented = generateNetwork({
        seed,
        codebook: personCodebook(4, withRef),
        stages: [pedigree()],
      }).network.nodes;

      const shape = (node: NcNode) => {
        const { ref: _ref, ...rest } = node[entityAttributesProperty];
        return rest;
      };
      expect(augmented.map(shape)).toEqual(plain.map(shape));

      // The interface's own invariant, alongside: exactly one proband, first.
      expect(plain.length).toBe(4);
      expect(plain.map((node) => node[entityAttributesProperty].isEgo)).toEqual(
        plain.map((_node, index) => index === 0),
      );
    }
  });
});
