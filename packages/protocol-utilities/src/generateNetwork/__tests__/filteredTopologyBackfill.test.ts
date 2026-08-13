import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork';
import { SyntheticDataConstraintError } from '../constraints/error';

const stage = (value: Record<string, unknown>): Stage =>
  value as unknown as Stage;

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const codebook = {
  node: {
    person: {
      name: 'Person',
      variables: {
        name: { name: 'Name', type: 'text' },
        flag: {
          name: 'Flag',
          type: 'boolean',
          synthetic: { probabilityTrue: 1 },
        },
      },
    },
  },
  edge: {
    knows: { name: 'Knows', variables: {} },
    trusts: { name: 'Trusts', variables: {} },
  },
} as unknown as Codebook;

const people = (count: number) =>
  stage({
    id: 'people',
    type: 'NameGeneratorQuickAdd',
    synthetic: { count: { distribution: 'constant', value: count } },
    label: 'People',
    subject: { entity: 'node', type: 'person' },
    quickAdd: 'name',
    prompts: [{ id: 'people-prompt', text: 'Who?' }],
  });

const flagForm = stage({
  id: 'flag-form',
  type: 'AlterForm',
  label: 'Flag people',
  subject: { entity: 'node', type: 'person' },
  filter: {
    join: 'AND',
    rules: [
      {
        id: 'has-name',
        type: 'node',
        options: {
          type: 'person',
          attribute: 'name',
          operator: 'EXISTS',
        },
      },
    ],
  },
  form: { title: 'Flag', fields: [{ variable: 'flag', prompt: 'Flag?' }] },
});

const topology = (id: string, edgeType: string) =>
  stage({
    id,
    type: 'Sociogram',
    synthetic: {
      topology: {
        metric: 'density',
        distribution: { distribution: 'constant', value: 1 },
      },
    },
    label: id,
    subject: { entity: 'node', type: 'person' },
    filter: {
      join: 'AND',
      rules: [
        {
          id: `${id}-flagged`,
          type: 'node',
          options: {
            type: 'person',
            attribute: 'flag',
            operator: 'EXACTLY',
            value: true,
          },
        },
      ],
    },
    prompts: [
      {
        id: `${id}-prompt`,
        text: 'Link them',
        layout: { layoutVariable: 'layout' },
        edges: { create: edgeType },
      },
    ],
  });

describe('walk-time topology domains', () => {
  it('backfills planned-node pairs admitted by a filtered-only write', () => {
    const { network } = generateNetwork({
      codebook,
      stages: [people(3), flagForm, topology('links', 'knows')],
      seed: 1,
      respectSkipLogicAndFiltering: true,
    });

    expect(network.edges).toHaveLength(3);
  });

  it('applies the pair budget across fallback edge domains', () => {
    expect(() =>
      generateNetwork({
        codebook,
        stages: [
          people(501),
          flagForm,
          topology('knows-stage', 'knows'),
          topology('trusts-stage', 'trusts'),
        ],
        seed: 1,
        respectSkipLogicAndFiltering: true,
      }),
    ).toThrow(SyntheticDataConstraintError);
  });
});
