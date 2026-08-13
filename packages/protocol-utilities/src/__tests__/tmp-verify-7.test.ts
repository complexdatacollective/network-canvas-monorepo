import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import { generateNetwork } from '../generateNetwork';
import { canonicalComparatorEdges } from '../generateNetwork/constraints/dependencyOrder';
import type {
  ConstrainedVariable,
  EntityConstraints,
} from '../generateNetwork/constraints/types';

/**
 * Candidate bug: canonicalComparatorEdges dedup key allegedly joins
 * [lower, upper, strict] such that ('a','b c',true) and ('a b','c',true)
 * collide as the same key 'a b c true', dropping the second edge.
 *
 * These tests assert the CORRECT behaviour (both edges retained, generated
 * values satisfy both constraints); they FAIL today if the bug is real.
 */

const constrained = (greaterThanVariable?: string): ConstrainedVariable =>
  ({
    entry: {} as ConstrainedVariable['entry'],
    constraints: {
      required: false,
      unique: false,
      ...(greaterThanVariable === undefined ? {} : { greaterThanVariable }),
    },
  }) as ConstrainedVariable;

describe('canonicalComparatorEdges dedup key ambiguity', () => {
  it('keeps both edges when id boundaries differ but flat concatenation matches', () => {
    const entity: EntityConstraints = new Map([
      ['a', constrained()],
      ['b c', constrained('a')], // edge ('a', 'b c', strict)
      ['a b', constrained()],
      ['c', constrained('a b')], // edge ('a b', 'c', strict)
    ]);

    const edges = canonicalComparatorEdges(entity);

    expect(edges).toHaveLength(2);
    expect(edges).toContainEqual({ lower: 'a', upper: 'b c', strict: true });
    expect(edges).toContainEqual({ lower: 'a b', upper: 'c', strict: true });
  });
});

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const stage = (value: Record<string, unknown>): Stage =>
  value as unknown as Stage;

const numberVar = (name: string, validation: Record<string, unknown> = {}) => ({
  name,
  type: 'number',
  validation: { required: true, ...validation },
});

const codebook: Codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        'name': { name: 'name', type: 'text' },
        'a': numberVar('varA', { minValue: 0, maxValue: 100 }),
        'b c': numberVar('varBC', { greaterThanVariable: 'a', maxValue: 200 }),
        'a b': numberVar('varAB', { minValue: 0, maxValue: 100 }),
        'c': numberVar('varC', { greaterThanVariable: 'a b', maxValue: 200 }),
      },
      synthetic: { count: { distribution: 'constant', value: 4 } },
    },
  },
  ego: { variables: {} },
} as unknown as Codebook;

const stages: Stage[] = [
  stage({
    id: 'ng',
    type: 'NameGeneratorQuickAdd',
    label: 'Names',
    subject: { entity: 'node', type: 'person' },
    quickAdd: 'name',
    prompts: [{ id: 'ng-p1', text: 'Who?' }],
    behaviours: { minNodes: 4, maxNodes: 4 },
  }),
  stage({
    id: 'af',
    type: 'AlterForm',
    label: 'Details',
    subject: { entity: 'node', type: 'person' },
    introductionPanel: { title: 'T', text: 'X' },
    form: {
      fields: [
        { variable: 'a', prompt: 'A?' },
        { variable: 'b c', prompt: 'BC?' },
        { variable: 'a b', prompt: 'AB?' },
        { variable: 'c', prompt: 'C?' },
      ],
    },
  }),
];

describe('generated values honour every declared comparator', () => {
  it('never emits c <= "a b" alongside a satisfied "b c" > a', () => {
    for (let seed = 0; seed < 25; seed++) {
      const { network } = generateNetwork({ codebook, stages, seed });
      for (const node of network.nodes as NcNode[]) {
        const attrs = node[entityAttributesProperty] as Record<string, unknown>;
        const a = attrs['a'] as number;
        const bc = attrs['b c'] as number;
        const ab = attrs['a b'] as number;
        const c = attrs['c'] as number;
        expect(
          bc,
          `seed ${seed}: "b c" (${bc}) must be > a (${a})`,
        ).toBeGreaterThan(a);
        expect(
          c,
          `seed ${seed}: c (${c}) must be > "a b" (${ab})`,
        ).toBeGreaterThan(ab);
      }
    }
  });
});
