import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { entityAttributeReference } from '../../schemas/8/entity-attribute-reference';
import { collectEntityAttributeReferencesFromSchema } from '../collectEntityAttributeReferences';

const stageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('OrdinalBin'),
    subject: z.object({ entity: z.string(), type: z.string() }),
    prompts: z.array(
      z.object({
        variable: entityAttributeReference({ subject: 'stageSubject' }),
      }),
    ),
  }),
  z.object({
    type: z.literal('TieStrengthCensus'),
    subject: z.object({ entity: z.string(), type: z.string() }),
    prompts: z.array(
      z.object({
        createEdge: z.string(),
        edgeVariable: entityAttributeReference({
          subject: { sibling: 'createEdge', entity: 'edge' },
          requireType: ['ordinal'],
        }),
      }),
    ),
  }),
]);

const schema = z.object({
  stages: z.array(stageSchema),
  codebook: z.object({
    node: z.record(
      z.string(),
      z.object({
        variables: z.record(
          z.string(),
          z.object({
            validation: z
              .object({
                sameAs: entityAttributeReference({
                  subject: 'owningVariable',
                }).optional(),
              })
              .optional(),
          }),
        ),
      }),
    ),
  }),
});

describe('collectEntityAttributeReferencesFromSchema', () => {
  it('resolves a stageSubject reference with path and subject', () => {
    const value = {
      stages: [
        {
          type: 'OrdinalBin',
          subject: { entity: 'node', type: 'person' },
          prompts: [{ variable: 'age' }],
        },
      ],
      codebook: { node: {} },
    };
    expect(
      collectEntityAttributeReferencesFromSchema(schema, value),
    ).toContainEqual({
      path: ['stages', 0, 'prompts', 0, 'variable'],
      variableId: 'age',
      subject: { entity: 'node', type: 'person' },
      requireType: undefined,
    });
  });

  it('resolves a sibling-field subject and carries requireType', () => {
    const value = {
      stages: [
        {
          type: 'TieStrengthCensus',
          subject: { entity: 'node', type: 'person' },
          prompts: [{ createEdge: 'friend', edgeVariable: 'weight' }],
        },
      ],
      codebook: { node: {} },
    };
    expect(
      collectEntityAttributeReferencesFromSchema(schema, value),
    ).toContainEqual({
      path: ['stages', 0, 'prompts', 0, 'edgeVariable'],
      variableId: 'weight',
      subject: { entity: 'edge', type: 'friend' },
      requireType: ['ordinal'],
    });
  });

  it('resolves owningVariable subject from the codebook path', () => {
    const value = {
      stages: [],
      codebook: {
        node: {
          person: { variables: { end: { validation: { sameAs: 'start' } } } },
        },
      },
    };
    expect(
      collectEntityAttributeReferencesFromSchema(schema, value),
    ).toContainEqual({
      path: [
        'codebook',
        'node',
        'person',
        'variables',
        'end',
        'validation',
        'sameAs',
      ],
      variableId: 'start',
      subject: { entity: 'node', type: 'person' },
      requireType: undefined,
    });
  });

  it('leaves filterRule references with an undefined subject (validated elsewhere)', () => {
    const filterSchema = z.object({
      attribute: entityAttributeReference({ subject: 'filterRule' }),
    });
    expect(
      collectEntityAttributeReferencesFromSchema(filterSchema, {
        attribute: 'x',
      }),
    ).toEqual([
      {
        path: ['attribute'],
        variableId: 'x',
        subject: undefined,
        requireType: undefined,
      },
    ]);
  });
});
