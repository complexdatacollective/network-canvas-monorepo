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
  color: z.enum(ordinalColorSequence).optional(),
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
    // The runtime only renders an 'other' bin when otherVariable is set, so
    // otherOptionLabel/otherVariablePrompt without it are silently ignored.
    if (!prompt.otherVariable && prompt.otherOptionLabel) {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'otherOptionLabel requires otherVariable to be set.',
        path: ['otherOptionLabel'],
      });
    }
    if (!prompt.otherVariable && prompt.otherVariablePrompt) {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'otherVariablePrompt requires otherVariable to be set.',
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
