import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork';
import { SyntheticDataConstraintError } from '../constraints/error';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

/**
 * Variable ids containing commas, declared in the order 'x', 'y,z', 'x,y',
 * 'z'. Two disjoint sameAs pairs: ('x', 'y,z') and ('x,y', 'z'). Both pairs'
 * variableIds arrays comma-join to the same string 'x,y,z'.
 */
const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        'x': { name: 'X', type: 'boolean' },
        'y,z': { name: 'YZ', type: 'boolean', validation: { sameAs: 'x' } },
        'x,y': { name: 'XY', type: 'boolean' },
        'z': { name: 'Z', type: 'boolean', validation: { sameAs: 'x,y' } },
      },
    },
  },
} as unknown as Codebook;

const stage = {
  id: 'stage-1',
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  form: {
    title: 'Add a person',
    fields: [
      { variable: 'x', prompt: 'X' },
      { variable: 'y,z', prompt: 'YZ' },
      { variable: 'x,y', prompt: 'XY' },
      { variable: 'z', prompt: 'Z' },
    ],
  },
  prompts: [
    {
      id: 'p1',
      text: 'Name people',
      additionalAttributes: [
        { variable: 'x', value: true },
        { variable: 'y,z', value: false },
      ],
    },
    {
      id: 'p2',
      text: 'Name more people',
      additionalAttributes: [
        { variable: 'x,y', value: false },
        { variable: 'z', value: true },
      ],
    },
  ],
  behaviours: { minNodes: 2, maxNodes: 4 },
} as unknown as Stage;

describe('broken-fixed-value dedup key with comma-bearing variable ids', () => {
  it('reports both distinct prompt-fixed sameAs contradictions', () => {
    let caught: unknown;
    try {
      generateNetwork({ seed: 3, codebook, stages: [stage] });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SyntheticDataConstraintError);
    const { conflicts } = caught as SyntheticDataConstraintError;

    const promptFixed = conflicts.filter(
      (conflict) =>
        conflict.rules.includes('sameAs') &&
        conflict.rules.includes('additionalAttributes'),
    );

    // The protocol contains two distinct contradictions: prompt p1 fixes
    // "X"=true and "YZ"=false against sameAs('y,z' -> 'x'), and prompt p2
    // fixes "XY"=false and "Z"=true against sameAs('z' -> 'x,y'). Each must
    // be reported. If the dedup key comma-joins the variable ids, both keys
    // collapse to 'sameAs:x,y,z' and only one conflict is reported.
    const reportedPairs = promptFixed
      .map((conflict) => JSON.stringify(conflict.variableIds))
      .toSorted();

    expect(reportedPairs).toEqual([
      JSON.stringify(['x', 'y,z']),
      JSON.stringify(['x,y', 'z']),
    ]);
  });
});
