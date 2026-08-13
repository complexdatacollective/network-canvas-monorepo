import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { generateNetwork } from '../../../generateNetwork';
import { SyntheticDataConstraintError } from '../../constraints/error';

const stage = (value: Record<string, unknown>): Stage =>
  value as unknown as Stage;

const topology = (id: string, edgeType: string) =>
  stage({
    id,
    type: 'Sociogram',
    synthetic: {
      topology: {
        metric: 'density',
        distribution: { distribution: 'constant', value: 0 },
      },
    },
    label: id,
    subject: { entity: 'node', type: 'person' },
    prompts: [
      {
        id: `${id}-prompt`,
        text: 'Link them',
        layout: { layoutVariable: 'layout' },
        edges: { create: edgeType },
      },
    ],
  });

describe('the whole-run pair-work budget', () => {
  it('counts separate edge domains together', () => {
    expect(() =>
      generateNetwork({
        codebook: {
          node: {
            person: {
              name: 'Person',
              variables: { name: { name: 'Name', type: 'text' } },
            },
          },
          edge: {
            knows: { name: 'Knows', variables: {} },
            trusts: { name: 'Trusts', variables: {} },
          },
        },
        stages: [
          stage({
            id: 'people',
            type: 'NameGeneratorQuickAdd',
            synthetic: {
              count: { distribution: 'constant', value: 501 },
            },
            label: 'People',
            subject: { entity: 'node', type: 'person' },
            quickAdd: 'name',
            prompts: [{ id: 'people-prompt', text: 'Who?' }],
          }),
          topology('knows-stage', 'knows'),
          topology('trusts-stage', 'trusts'),
        ],
        seed: 1,
      }),
    ).toThrow(SyntheticDataConstraintError);
  });
});
