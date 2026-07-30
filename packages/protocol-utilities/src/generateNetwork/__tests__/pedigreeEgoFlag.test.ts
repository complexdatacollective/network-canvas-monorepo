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

/** One pedigree node per stage, so a two-value domain covers the protocol. */
const ONE_NODE_PEDIGREE = { familyPedigreeNodeCount: { min: 1, max: 1 } };

function personCodebook(variables: Record<string, unknown>): Codebook {
  return {
    node: { person: { color: 'node-color-seq-1', variables } },
    edge: { family: { color: 'edge-color-seq-1', variables: {} } },
  } as unknown as Codebook;
}

function pedigree(egoVariable?: string): Stage {
  return {
    id: 'stage-pedigree',
    type: 'FamilyPedigree',
    label: 'Family',
    nodeConfig: {
      type: 'person',
      nodeLabelVariable: 'name',
      ...(egoVariable === undefined ? {} : { egoVariable }),
    },
    edgeConfig: { type: 'family' },
  } as unknown as Stage;
}

function nameGenerator(nodes: number): Stage {
  return {
    id: 'stage-ng',
    type: 'NameGenerator',
    label: 'More people',
    subject: { entity: 'node', type: 'person' },
    prompts: [{ id: 'p1', text: 'Name people' }],
    behaviours: { minNodes: nodes, maxNodes: nodes },
  } as unknown as Stage;
}

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
 * before the run starts, alongside a roster row's and a prompt's
 * `additionalAttributes`.
 */
describe('a pedigree ego flag on a unique variable', () => {
  const uniqueFlagCodebook = personCodebook({
    name: { name: 'Name', type: 'text' },
    isEgo: { name: 'Is ego', type: 'boolean', validation: { unique: true } },
  });

  it(`is held back from an earlier stage's draw, over ${SEEDS} seeds`, () => {
    // The pedigree runs second, so nothing it does can reach the draw that has
    // already happened: the flag has to be reserved before the first stage
    // runs or the name generator is issued `true` from the first position of
    // the slot's sequence and the pedigree writes `true` over its proband as
    // well.
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: uniqueFlagCodebook,
        stages: [nameGenerator(1), pedigree('isEgo')],
        config: ONE_NODE_PEDIGREE,
      });

      const flags = network.nodes.map(
        (node) => node[entityAttributesProperty].isEgo,
      );
      if (new Set(flags.map((flag) => JSON.stringify(flag))).size !== 2) {
        failures.push(`seed ${seed}: ${describeNodes(network.nodes)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it(`spends none of the slot's own values, over ${SEEDS} seeds`, () => {
    // The flag is written rather than drawn, so it must cost the registry no
    // sequence position. Drawing it and overwriting the result leaves the
    // registry holding a value no node carries, and the three people here then
    // reach only the top two of a three-value domain — with the bottom one
    // spent on a draw that was thrown away.
    const codebook = personCodebook({
      name: { name: 'Name', type: 'text' },
      isEgo: {
        name: 'Is ego',
        type: 'number',
        validation: { unique: true, minValue: 1, maxValue: 3 },
      },
    });
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [pedigree('isEgo'), nameGenerator(2)],
        config: ONE_NODE_PEDIGREE,
      });

      const drawn = network.nodes
        .filter((node) => node.stageId === 'stage-ng')
        .map((node) => node[entityAttributesProperty].isEgo)
        .toSorted((a, b) => Number(a) - Number(b));

      if (JSON.stringify(drawn) !== JSON.stringify([1, 2])) {
        failures.push(`seed ${seed}: ${describeNodes(network.nodes)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it(`is recorded against a roster row carrying it, over ${SEEDS} seeds`, () => {
    // A roster row's value is the researcher's rather than the registry's, and
    // a row offering a value the network already holds is passed over — judged
    // by asking the registry whether that value is taken. So the proband's flag
    // has to be claimed and not merely reserved: a reservation is a preference
    // a row is never measured against, and the row carrying `true` would be
    // drawn alongside the proband already holding it.
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
      prompts: [{ id: 'p1', text: 'Pick people' }],
      behaviours: { minNodes: 1, maxNodes: 1 },
    } as unknown as Stage;
    const failures: string[] = [];

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: uniqueFlagCodebook,
        stages: [pedigree('isEgo'), roster],
        externalData: { 'stage-roster': rows.map((row) => ({ ...row })) },
        config: ONE_NODE_PEDIGREE,
      });

      const flags = network.nodes.map(
        (node) => node[entityAttributesProperty].isEgo,
      );
      if (new Set(flags.map((flag) => JSON.stringify(flag))).size !== 2) {
        failures.push(`seed ${seed}: ${describeNodes(network.nodes)}`);
      }
    }

    expect(failures).toEqual([]);
  });
});

describe('a pedigree ego flag nothing reads', () => {
  it('draws exactly as it did when the type carries a unique variable', () => {
    // Settling the flag before the draw takes the variable out of the draw and
    // moves every random number after it, so it is done only where the flag's
    // own value is read: by a rule resolving against it, or by the registry
    // issuing it. A `unique` variable elsewhere on the same type is neither —
    // the flag is not a member of that slot — and this pedigree must keep the
    // values it had. Held against the same protocol naming no ego variable at
    // all, where only the flag itself may differ.
    const codebook = personCodebook({
      name: { name: 'Name', type: 'text' },
      isEgo: { name: 'Is ego', type: 'boolean' },
      age: {
        name: 'Age',
        type: 'number',
        validation: { minValue: 0, maxValue: 100 },
      },
      ref: { name: 'Ref', type: 'text', validation: { unique: true } },
    });

    const withoutFlag = (node: NcNode) => {
      const { isEgo: _isEgo, ...rest } = node[entityAttributesProperty];
      return rest;
    };

    for (let seed = 1; seed <= 25; seed++) {
      // A later stage as well, so a shifted random stream shows up in what the
      // rest of the protocol draws and not only inside the pedigree.
      const stages = [nameGenerator(3)];
      const pinned = generateNetwork({
        seed,
        codebook,
        stages: [pedigree('isEgo'), ...stages],
      }).network.nodes;

      expect(pinned.map(withoutFlag)).toEqual(
        generateNetwork({
          seed,
          codebook,
          stages: [pedigree(), ...stages],
        }).network.nodes.map(withoutFlag),
      );

      const fromPedigree = pinned.filter(
        (node) => node.stageId === 'stage-pedigree',
      );
      expect(fromPedigree.length).toBeGreaterThan(1);
      expect(
        fromPedigree.map((node) => node[entityAttributesProperty].isEgo),
      ).toEqual(fromPedigree.map((_node, index) => index === 0));
    }
  });
});
