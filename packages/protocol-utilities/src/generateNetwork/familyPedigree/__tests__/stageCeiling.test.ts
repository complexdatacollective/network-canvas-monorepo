import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';

import {
  DEFAULT_PEDIGREE_NODE_CEILING,
  pedigreeCeilingForStage,
} from '../stageCeiling';

/**
 * A pedigree's ceiling belongs to the node type it builds. Maximised across
 * the protocol, a type declared at seven could grow optional relatives up to
 * another type's forty while per-type feasibility still counted seven — an
 * under-count, and that is the direction that lets a run exhaust a value space
 * preflight had already accepted.
 */

const codebook = {
  node: {
    small: {
      name: 'Small family',
      color: 'node-color-seq-1',
      synthetic: { count: { distribution: 'constant', value: 7 } },
      variables: {},
    },
    large: {
      name: 'Large family',
      color: 'node-color-seq-2',
      synthetic: { count: { distribution: 'constant', value: 40 } },
      variables: {},
    },
    undeclared: {
      name: 'Undeclared',
      color: 'node-color-seq-3',
      variables: {},
    },
  },
  ego: { variables: {} },
  edge: {},
} as unknown as StructuralCodebook;

const pedigreeFor = (type: string): Stage =>
  ({
    id: `pedigree-${type}`,
    type: 'FamilyPedigree',
    label: type,
    nodeConfig: { type },
  }) as unknown as Stage;

describe('a pedigree stage ceiling', () => {
  it('comes from the node type that stage names', () => {
    expect(pedigreeCeilingForStage(codebook, pedigreeFor('small'))).toBe(7);
    expect(pedigreeCeilingForStage(codebook, pedigreeFor('large'))).toBe(40);
  });

  it('falls back to the branch cap where no count is declared', () => {
    expect(pedigreeCeilingForStage(codebook, pedigreeFor('undeclared'))).toBe(
      DEFAULT_PEDIGREE_NODE_CEILING,
    );
  });

  it('supplies nothing for a type the codebook does not define', () => {
    // Architect previews a pedigree while its node type is still being chosen;
    // supplying a ceiling there would be inventing one.
    expect(
      pedigreeCeilingForStage(codebook, pedigreeFor('missing')),
    ).toBeUndefined();
  });

  it('supplies nothing for a stage that is not a pedigree', () => {
    expect(
      pedigreeCeilingForStage(codebook, {
        id: 'ng',
        type: 'NameGenerator',
      } as unknown as Stage),
    ).toBeUndefined();
  });
});
