import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { entityAttributeReference } from '../../schemas/8/entity-attribute-reference.ts';
import { collectEntityAttributeReferencesFromSchema } from '../collectEntityAttributeReferences.ts';

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

  it('discriminated union: traverses a branch selected by discriminator even if safeParse would fail (missing required field)', () => {
    const toleranceSchema = z.discriminatedUnion('type', [
      z.object({
        type: z.literal('A'),
        subject: z.object({ entity: z.string(), type: z.string() }),
        required: z.string(),
        variable: entityAttributeReference({ subject: 'stageSubject' }),
      }),
      z.object({
        type: z.literal('B'),
        subject: z.object({ entity: z.string(), type: z.string() }),
      }),
    ]);

    // 'required' is missing, so safeParse on the 'A' branch would fail.
    // The walker must still select 'A' by discriminator and find the variable ref.
    const value = {
      type: 'A',
      subject: { entity: 'node', type: 'person' },
      variable: 'ageVar',
      // 'required' intentionally omitted
    };

    expect(
      collectEntityAttributeReferencesFromSchema(toleranceSchema, value),
    ).toContainEqual({
      path: ['variable'],
      variableId: 'ageVar',
      subject: { entity: 'node', type: 'person' },
      requireType: undefined,
    });
  });

  it('plain z.union: still uses safeParse to select a branch (non-discriminated path)', () => {
    const plainUnion = z.union([
      z.object({
        kind: z.literal('X'),
        ref: entityAttributeReference({ subject: 'filterRule' }),
      }),
      z.object({
        kind: z.literal('Y'),
        other: z.string(),
      }),
    ]);

    const value = { kind: 'X', ref: 'varId' };

    expect(
      collectEntityAttributeReferencesFromSchema(plainUnion, value),
    ).toContainEqual({
      path: ['ref'],
      variableId: 'varId',
      subject: undefined,
      requireType: undefined,
    });
  });

  it('plain z.union: collects attribute refs from an invalid value that fails safeParse on all branches', () => {
    // One branch has a tagged `attribute` reference plus a required `id` field.
    // The other branch lacks `attribute`. A value that sets `attribute` but omits
    // `id` will fail safeParse on both branches; the extractor must still return
    // the attribute hit so filter-rule refs are never silently dropped.
    const branchWithRef = z.object({
      attribute: entityAttributeReference({ subject: 'filterRule' }),
      id: z.string(), // required — omitting this makes safeParse fail
    });
    const branchWithout = z.object({
      other: z.string(),
    });
    const plainUnion = z.union([branchWithRef, branchWithout]);

    const invalidValue = { attribute: 'filterVar' }; // missing required `id`

    const hits = collectEntityAttributeReferencesFromSchema(
      plainUnion,
      invalidValue,
    );

    expect(hits).toContainEqual({
      path: ['attribute'],
      variableId: 'filterVar',
      subject: undefined,
      requireType: undefined,
    });
  });

  it('plain z.union: valid value still resolves via single matching branch (no double-counting)', () => {
    const branchA = z.object({
      kind: z.literal('A'),
      ref: entityAttributeReference({ subject: 'filterRule' }),
    });
    const branchB = z.object({
      kind: z.literal('B'),
      other: z.string(),
    });
    const plainUnion = z.union([branchA, branchB]);

    const validValue = { kind: 'A', ref: 'myVar' };

    const hits = collectEntityAttributeReferencesFromSchema(
      plainUnion,
      validValue,
    );

    // Exactly one hit — no duplication from branch-merging
    expect(hits).toHaveLength(1);
    expect(hits[0]).toEqual({
      path: ['ref'],
      variableId: 'myVar',
      subject: undefined,
      requireType: undefined,
    });
  });
});
