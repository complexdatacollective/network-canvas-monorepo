import { z } from 'zod';

import { entityAttributeReference } from '../entity-attribute-reference';
import { entityTypeReference } from '../entity-type-reference';
import { SortOrderSchema } from '../filters';

export const promptSchema = z.strictObject({
  id: z.string(),
  text: z.string(),
});

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

export const sociogramPromptSchema = promptSchema.extend({
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
  highlight: z
    .strictObject({
      allowHighlighting: z.boolean().optional(),
      variable: entityAttributeReference({
        subject: 'stageSubject',
      }).optional(),
    })
    .optional(),
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

export const ordinalBinPromptSchema = promptSchema.extend({
  variable: entityAttributeReference({ subject: 'stageSubject' }),
  bucketSortOrder: SortOrderSchema.optional(),
  binSortOrder: SortOrderSchema.optional(),
  color: z.string().optional(),
});

export const categoricalBinPromptSchema = promptSchema
  .extend({
    variable: entityAttributeReference({
      subject: 'stageSubject',
    }),
    // TODO: This should be structured this way:
    // otherOption: z.strictObject({
    // 	binLabel: z.string(),
    // 	variable: z.string(),
    // 	prompt: z.string(),
    // }).optional(),
    otherVariable: entityAttributeReference({
      subject: 'stageSubject',
    }).optional(),
    otherVariablePrompt: z.string().optional(),
    otherOptionLabel: z.string().optional(),
    bucketSortOrder: SortOrderSchema.optional(),
    binSortOrder: SortOrderSchema.optional(),
  })
  .superRefine((prompt, ctx) => {
    // The 'other' follow-up dialog renders otherVariablePrompt as its label;
    // without it the dialog shows an empty, asterisk-only label.
    if (prompt.otherVariable && !prompt.otherVariablePrompt) {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'otherVariablePrompt is required when otherVariable is set.',
        path: ['otherVariablePrompt'],
      });
    }
  });

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
