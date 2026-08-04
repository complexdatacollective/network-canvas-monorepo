import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';
import { SyntheticDataConstraintError } from '../constraints/error';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

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

/**
 * A FamilyPedigree stage writes its ego flag itself — the runtime's
 * `egoCellTransform` sets it true on the proband and explicitly false on
 * everybody else — so on a `unique` variable that flag is a value spoken for
 * before the run starts, alongside a roster row's and a prompt's
 * `additionalAttributes`.
 */
/**
 * These used to assert that the ego flag was reserved out of other stages'
 * draws, using a one-node pedigree where the flag was written exactly once.
 *
 * The generator can no longer build a pedigree that small — ego needs the two
 * parents the interface will not finalize without — so the flag is written
 * `true` once and `false` on everybody else, and a `unique` rule over it can
 * never hold. That is true of every variable a pedigree writes: they are
 * structural values that recur by their nature. The reservation itself is still
 * exercised, through `analyseFeasibility`, in `constraints/__tests__/feasibility.test.ts`.
 */
describe('a unique rule on a variable the pedigree writes', () => {
  const uniqueEgoFlag = personCodebook({
    name: { name: 'Name', type: 'text' },
    isEgo: { name: 'Is ego', type: 'boolean', validation: { unique: true } },
  });

  it('is refused up front, naming the pedigree as the writer', () => {
    const generate = (): unknown =>
      generateNetwork({
        seed: 1,
        codebook: uniqueEgoFlag,
        stages: [pedigree('isEgo')],
      });

    expect(generate).toThrow(SyntheticDataConstraintError);
    expect(generate).toThrow(/a family pedigree fixes this to false/);
  });
});

describe('a pedigree ego flag nothing reads', () => {
  it('marks one proband without exhausting a unique variable on the type', () => {
    // This used to assert that naming an ego variable cost the run no random
    // numbers, by holding the draw against a protocol that named none. The
    // pedigree now settles the flag, the sex, the kinship term and the
    // nominations itself and draws only what is left, so naming the variable
    // legitimately moves the stream. What still has to hold is that the flag
    // lands once and that a `unique` variable elsewhere on the same type is
    // neither exhausted nor duplicated by the values the pedigree writes.
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

    for (let seed = 1; seed <= 25; seed++) {
      // A later stage as well, so a shifted random stream shows up in what the
      // rest of the protocol draws and not only inside the pedigree.
      const stages = [nameGenerator(3)];
      const pinned = generateNetwork({
        seed,
        codebook,
        stages: [pedigree('isEgo'), ...stages],
      }).network.nodes;

      const refs = pinned
        .map((node) => node[entityAttributesProperty].ref)
        .filter((value) => value !== undefined);
      expect(new Set(refs).size, `seed ${seed}`).toBe(refs.length);

      const fromPedigree = pinned.filter(
        (node) => node.stageId === 'stage-pedigree',
      );
      expect(fromPedigree.length).toBeGreaterThan(1);
      expect(
        fromPedigree.filter(
          (node) => node[entityAttributesProperty].isEgo === true,
        ),
      ).toHaveLength(1);
    }
  });
});
