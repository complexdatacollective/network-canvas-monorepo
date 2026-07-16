import { z } from 'zod';

import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { entityTypeReference } from '../entity-type-reference.ts';
import { SortOrderSchema } from '../filters/index.ts';

export const promptSchema = z.strictObject({
  id: z.string(),
  text: z.string().min(1),
});

// Re-parses an already-refined value against a narrowing union so the STATIC
// TYPE becomes the union, without a cast. The preceding superRefine rejects —
// with a targeted, author-facing message — every value the union cannot
// represent, so for values that reach the transform the sub-parse always
// succeeds; its issues are forwarded as a guard against the two drifting.
// (`.pipe(union)` can't express this: our reference brands apply to the
// output side only, so the union's unbranded input type fails pipe's
// constraint against the refined stage's branded output.)
const narrowTo =
  <T extends z.ZodType>(narrowed: T) =>
  (value: unknown, ctx: z.RefinementCtx): z.output<T> => {
    const result = narrowed.safeParse(value);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: 'custom' as const,
          message: issue.message,
          path: issue.path,
        });
      }
      return z.NEVER;
    }
    return result.data;
  };

export type BasePrompt = z.infer<typeof promptSchema>;

const AdditionalAttributesSchema = z.array(
  z.strictObject({
    variable: entityAttributeReference({ subject: 'stageSubject' }),
    value: z.boolean(),
  }),
);

export type AdditionalAttributes = z.infer<typeof AdditionalAttributesSchema>;

export const nameGeneratorPromptSchema = promptSchema.extend({
  additionalAttributes: AdditionalAttributesSchema.optional(),
});

// Loose shape + superRefine for the author-facing message, piped into a union
// so the static type proves `variable` exists whenever highlighting is on.
// The union must accept exactly what the refine accepts.
const sociogramHighlightSchema = z
  .strictObject({
    allowHighlighting: z.boolean().optional(),
    variable: entityAttributeReference({
      subject: 'stageSubject',
    }).optional(),
  })
  .superRefine((highlight, ctx) => {
    if (highlight.allowHighlighting && !highlight.variable) {
      ctx.addIssue({
        code: 'custom' as const,
        message:
          'highlight.variable is required when allowHighlighting is enabled.',
        path: ['variable'],
      });
    }
  })
  .transform(
    narrowTo(
      z.union([
        z.strictObject({
          allowHighlighting: z.literal(true),
          variable: entityAttributeReference({ subject: 'stageSubject' }),
        }),
        z.strictObject({
          allowHighlighting: z.literal(false).optional(),
          variable: entityAttributeReference({
            subject: 'stageSubject',
          }).optional(),
        }),
      ]),
    ),
  );

export const sociogramPromptSchema = promptSchema
  .extend({
    sortOrder: SortOrderSchema.optional(),
    layout: z.strictObject({
      layoutVariable: entityAttributeReference({
        subject: 'stageSubject',
      }),
    }),
    edges: z
      .strictObject({
        display: z.array(entityTypeReference({ entity: 'edge' })).optional(),
        create: entityTypeReference({ entity: 'edge' }).optional(),
      })
      .optional(),
    highlight: sociogramHighlightSchema.optional(),
  })
  .superRefine((prompt, ctx) => {
    if (
      prompt.edges &&
      prompt.edges.create === undefined &&
      (prompt.edges.display === undefined || prompt.edges.display.length === 0)
    ) {
      ctx.addIssue({
        code: 'custom' as const,
        message:
          'edges must set create and/or a non-empty display; an empty edges object has no effect.',
        path: ['edges'],
      });
    }
  });

export const dyadCensusPromptSchema = promptSchema.extend({
  createEdge: entityTypeReference({ entity: 'edge' }),
});

export const tieStrengthCensusPromptSchema = promptSchema.extend({
  createEdge: entityTypeReference({ entity: 'edge' }),
  edgeVariable: entityAttributeReference({
    subject: { sibling: 'createEdge', entity: 'edge' },
    requireType: ['ordinal'],
  }),
  negativeLabel: z.string().min(1),
});

// The ten palette values the OrdinalBin interface maps to CSS colour
// variables (see the interview's OrdinalBinItem). Any other string is
// silently ignored by the runtime, so the schema only admits these.
export const ordinalColorSequence = [
  'ord-color-seq-1',
  'ord-color-seq-2',
  'ord-color-seq-3',
  'ord-color-seq-4',
  'ord-color-seq-5',
  'ord-color-seq-6',
  'ord-color-seq-7',
  'ord-color-seq-8',
  'ord-color-seq-9',
  'ord-color-seq-10',
] as const;

export const ordinalBinPromptSchema = promptSchema.extend({
  variable: entityAttributeReference({ subject: 'stageSubject' }),
  bucketSortOrder: SortOrderSchema.optional(),
  binSortOrder: SortOrderSchema.optional(),
  color: z.enum(ordinalColorSequence),
});

const categoricalBinPromptFields = {
  variable: entityAttributeReference({
    subject: 'stageSubject',
  }),
  bucketSortOrder: SortOrderSchema.optional(),
  binSortOrder: SortOrderSchema.optional(),
};

// Loose shape + superRefine for the author-facing messages, piped into a
// union so the static type proves otherOptionLabel and otherVariablePrompt
// exist whenever otherVariable is set. The union must accept exactly what the
// refine accepts, so every state the union cannot represent (the 'other'
// fields partially set, or set to empty strings) is rejected by the refine
// first with a targeted message.
export const categoricalBinPromptSchema = promptSchema
  .extend({
    ...categoricalBinPromptFields,
    otherVariable: entityAttributeReference({
      subject: 'stageSubject',
    }).optional(),
    otherVariablePrompt: z.string().optional(),
    otherOptionLabel: z.string().optional(),
  })
  .superRefine((prompt, ctx) => {
    if (prompt.otherVariable === '') {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'otherVariable must name a variable.',
        path: ['otherVariable'],
      });
      return;
    }
    // The 'other' follow-up dialog renders otherVariablePrompt as its label;
    // without it the dialog shows an empty, asterisk-only label.
    if (prompt.otherVariable && !prompt.otherVariablePrompt) {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'otherVariablePrompt is required when otherVariable is set.',
        path: ['otherVariablePrompt'],
      });
    }
    if (prompt.otherVariable && !prompt.otherOptionLabel) {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'otherOptionLabel is required when otherVariable is set.',
        path: ['otherOptionLabel'],
      });
    }
    // The runtime only renders an 'other' bin when otherVariable is set, so
    // otherOptionLabel/otherVariablePrompt without it are silently ignored.
    if (!prompt.otherVariable && prompt.otherOptionLabel !== undefined) {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'otherOptionLabel requires otherVariable to be set.',
        path: ['otherOptionLabel'],
      });
    }
    if (!prompt.otherVariable && prompt.otherVariablePrompt !== undefined) {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'otherVariablePrompt requires otherVariable to be set.',
        path: ['otherVariablePrompt'],
      });
    }
  })
  .transform(
    narrowTo(
      z.union([
        promptSchema.extend({
          ...categoricalBinPromptFields,
          otherVariable: entityAttributeReference({
            subject: 'stageSubject',
          }),
          otherVariablePrompt: z.string().min(1),
          otherOptionLabel: z.string().min(1),
        }),
        promptSchema.extend({
          ...categoricalBinPromptFields,
          otherVariable: z.undefined().optional(),
          otherVariablePrompt: z.undefined().optional(),
          otherOptionLabel: z.undefined().optional(),
        }),
      ]),
    ),
  );

export const oneToManyDyadCensusPromptSchema = promptSchema.extend({
  createEdge: entityTypeReference({ entity: 'edge' }),
  bucketSortOrder: SortOrderSchema.optional(),
  binSortOrder: SortOrderSchema.optional(),
});

export const geospatialPromptSchema = promptSchema.extend({
  variable: entityAttributeReference({ subject: 'stageSubject' }),
});

export const familyPedigreeNominationPromptSchema = promptSchema.extend({
  variable: entityAttributeReference({ subject: 'stageSubject' }),
});
