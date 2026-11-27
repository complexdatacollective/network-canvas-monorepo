import { z } from 'zod';

import { OrdinalColorReferenceSchema } from '../color-reference.ts';
import { asExclusiveVariants } from '../declared-variants.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { entityTypeReference } from '../entity-type-reference.ts';
import { SortOrderSchema } from '../filters/index.ts';
import {
  NodeTypeOrderSchema,
  NodeTypeSortOrderSchema,
} from '../filters/sort.ts';
import { localizedString, nonBlankText } from '../localized-string.ts';
import { protocolObjectId } from '../protocol-object-id.ts';

export { OrdinalColorSequence as ordinalColorSequence } from '../color-reference.ts';

export const promptSchema = z.strictObject({
  id: protocolObjectId('prompt'),
  text: localizedString(
    nonBlankText(),
    { format: 'markdown', lines: 'single' },
    {
      dynamicValues: 'prompt',
    },
  ),
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

// The interview stamps `value` onto the node when it joins the prompt and
// clears it when it leaves, so a non-boolean target would have collected data
// (including encrypted text) overwritten by, then erased with, a plain boolean.
const AdditionalAttributesSchema = z.array(
  z.strictObject({
    id: protocolObjectId('additionalAttribute'),
    variable: entityAttributeReference({
      subject: 'stageSubject',
      requireType: ['boolean'],
      usage: 'unvalidatedAttribute',
    }),
    value: z.boolean(),
  }),
);

export type AdditionalAttributes = z.infer<typeof AdditionalAttributesSchema>;

export const nameGeneratorPromptSchema = promptSchema.extend({
  additionalAttributes: AdditionalAttributesSchema.optional(),
});

/**
 * One row of a highlight: the node type it is about and the boolean attribute
 * of that type it shows. `writes` says whether the stage lets the participant
 * set the attribute by tapping a node (a Sociogram highlight task) or only
 * shows it, so a display stays out of the writers that the variable role and
 * exclusive-slot rules compare.
 */
export const highlightAttributeSchema = ({ writes }: { writes: boolean }) =>
  z.strictObject({
    id: protocolObjectId('highlightAttribute'),
    type: entityTypeReference({ entity: 'node' }),
    variable: entityAttributeReference({
      subject: { sibling: 'type', entity: 'node' },
      requireType: ['boolean'],
      ...(writes ? { usage: 'unvalidatedAttribute' as const } : {}),
    }),
  });

const displayedEdgeTypes = z.array(entityTypeReference({ entity: 'edge' }));

// The bucket of unplaced nodes is grouped by node type, in `nodeTypeOrder`
// or else subject order, and each group is sorted by its type's rules.
const sociogramPromptBase = promptSchema.extend({
  sortOrder: NodeTypeSortOrderSchema.optional(),
  nodeTypeOrder: NodeTypeOrderSchema.optional(),
});

// Each Sociogram prompt is one task. In a layout task the participant places
// and moves nodes; in a highlight task tapping a node toggles the boolean
// attribute its type's entry names; in a connect task tapping two nodes
// creates or removes an edge of `edges.create`. Nodes cannot be moved outside
// a layout task.
export const sociogramPromptSchema = z.discriminatedUnion('task', [
  sociogramPromptBase.extend({
    task: z.literal('layout'),
    edges: z
      .strictObject({ display: displayedEdgeTypes.optional() })
      .optional(),
  }),
  sociogramPromptBase.extend({
    task: z.literal('highlight'),
    highlight: z.array(highlightAttributeSchema({ writes: true })).min(1),
    edges: z
      .strictObject({ display: displayedEdgeTypes.optional() })
      .optional(),
  }),
  sociogramPromptBase.extend({
    task: z.literal('connect'),
    edges: z.strictObject({
      create: entityTypeReference({ entity: 'edge' }),
      display: displayedEdgeTypes.optional(),
    }),
  }),
]);

export const dyadCensusPromptSchema = promptSchema.extend({
  createEdge: entityTypeReference({ entity: 'edge' }),
});

export const tieStrengthCensusPromptSchema = promptSchema.extend({
  createEdge: entityTypeReference({ entity: 'edge' }),
  edgeVariable: entityAttributeReference({
    subject: { sibling: 'createEdge', entity: 'edge' },
    requireType: ['ordinal'],
    usage: 'unvalidatedAttribute',
  }),
  negativeLabel: localizedString(
    nonBlankText(),
    { format: 'markdown', lines: 'single' },
    {
      dynamicValues: 'prompt',
    },
  ),
});

export const ordinalBinPromptSchema = promptSchema.extend({
  variable: entityAttributeReference({
    subject: 'stageSubject',
    usage: 'unvalidatedAttribute',
  }),
  bucketSortOrder: SortOrderSchema.optional(),
  binSortOrder: SortOrderSchema.optional(),
  color: OrdinalColorReferenceSchema,
});

const categoricalBinPromptFields = {
  variable: entityAttributeReference({
    subject: 'stageSubject',
    usage: 'unvalidatedAttribute',
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
      requireType: ['text'],
      usage: 'validatedAttribute',
    }).optional(),
    // The question the "other" bin asks about the node just put in it, which
    // is a one-field form about that node.
    otherVariablePrompt: localizedString(
      nonBlankText(),
      { format: 'markdown', lines: 'single' },
      {
        dynamicValues: 'formField',
      },
    ).optional(),
    // The "other" bin's caption, which is not about the node being placed.
    otherOptionLabel: localizedString(
      nonBlankText(),
      { format: 'markdown', lines: 'single' },
      {
        dynamicValues: 'stageText',
      },
    ).optional(),
  })
  .superRefine((prompt, ctx) => {
    if (prompt.otherVariable === '') {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'otherVariable must name an attribute.',
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
            requireType: ['text'],
            usage: 'validatedAttribute',
          }),
          otherVariablePrompt: localizedString(
            nonBlankText(),
            { format: 'markdown', lines: 'single' },
            {
              dynamicValues: 'formField',
            },
          ),
          otherOptionLabel: localizedString(
            nonBlankText(),
            { format: 'markdown', lines: 'single' },
            {
              dynamicValues: 'prompt',
            },
          ),
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

// The ROW is the variant here: a bin prompt that offers an 'other' option
// carries all three of the fields that describe it, and one that does not
// carries none of them. Half of each is a prompt the schema refuses.
asExclusiveVariants(categoricalBinPromptSchema);

export const oneToManyDyadCensusPromptSchema = promptSchema.extend({
  createEdge: entityTypeReference({ entity: 'edge' }),
  bucketSortOrder: SortOrderSchema.optional(),
  binSortOrder: SortOrderSchema.optional(),
});

export const geospatialPromptSchema = promptSchema.extend({
  variable: entityAttributeReference({
    subject: 'stageSubject',
    usage: 'unvalidatedAttribute',
  }),
});
