import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork';
import { SyntheticDataConstraintError } from '../constraints/error';

const codebook = {
  node: {
    person: {
      name: 'Person',
      variables: {
        band: {
          name: 'Band',
          type: 'ordinal',
          options: [1, 2, 3, 4].map((value) => ({
            label: `Band ${value}`,
            value,
          })),
          validation: { unique: true },
        },
      },
    },
  },
  edge: {
    knows: {
      name: 'Knows',
      variables: {
        marker: {
          name: 'Marker',
          type: 'ordinal',
          options: [{ label: 'Only value', value: 1 }],
          validation: { unique: true },
        },
      },
    },
  },
} as unknown as StructuralCodebook;

const people = {
  id: 'people',
  type: 'NameGeneratorQuickAdd',
  label: 'People',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'band',
  prompts: [{ id: 'people-prompt', text: 'Who?' }],
  synthetic: { count: { distribution: 'constant', value: 4 } },
} as unknown as Stage;

const sociogram = (
  id: string,
  operator: 'LESS_THAN' | 'GREATER_THAN_OR_EQUAL',
): Stage =>
  ({
    id,
    type: 'Sociogram',
    label: id,
    subject: { entity: 'node', type: 'person' },
    filter: {
      join: 'AND',
      rules: [
        {
          id: `${id}-band`,
          type: 'node',
          options: {
            type: 'person',
            attribute: 'band',
            operator,
            value: 3,
          },
        },
      ],
    },
    prompts: [
      {
        id: `${id}-prompt`,
        text: 'Link them',
        layout: { layoutVariable: 'layout' },
        edges: { create: 'knows' },
      },
    ],
    synthetic: {
      topology: {
        metric: 'meanDegree',
        distribution: { distribution: 'constant', value: 0.5 },
      },
    },
  }) as unknown as Stage;

describe('same-subject topology feasibility ceilings', () => {
  it('sums disjoint filtered stage targets before checking unique values', () => {
    const generate = (): unknown =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [
          people,
          sociogram('lower-band', 'LESS_THAN'),
          sociogram('upper-band', 'GREATER_THAN_OR_EQUAL'),
        ],
        respectSkipLogicAndFiltering: true,
      });

    expect(generate).toThrow(SyntheticDataConstraintError);
    expect(generate).toThrow(/up to 2 edges of this type can be generated/);
  });
});
