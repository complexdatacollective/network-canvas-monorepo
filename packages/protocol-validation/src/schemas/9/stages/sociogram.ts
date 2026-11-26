import { z } from 'zod';

import { withUniqueObjectIds } from '../../../utils/protocolObjectIds.ts';
import { canvasBehavioursSchema } from '../common/behaviours.ts';
import {
  imageOrCirclesBackgroundSchema,
  sociogramPromptSchema,
} from '../common/index.ts';
import { nodeStageSubjectFor } from '../common/subjects.ts';
import { FilterSchema } from '../filters/index.ts';
import { baseStageSchema } from './base.ts';

export const sociogramStage = withUniqueObjectIds(
  baseStageSchema.extend({
    type: z.literal('Sociogram'),
    subject: nodeStageSubjectFor('Sociogram'),
    filter: FilterSchema.optional(),
    background: imageOrCirclesBackgroundSchema,
    behaviours: canvasBehavioursSchema,
    prompts: z
      .array(sociogramPromptSchema)
      .min(1)
      .superRefine((prompts, ctx) => {
        // Edge creation and highlighting are mutually exclusive tap behaviours;
        // when both are set the interview silently lets edge creation win.
        prompts.forEach((prompt, index) => {
          if (prompt.edges?.create && prompt.highlight?.allowHighlighting) {
            ctx.addIssue({
              code: 'custom' as const,
              message:
                'A Sociogram prompt cannot set both edges.create and highlight.allowHighlighting',
              path: [index],
            });
          }
        });
      }),
  }),
);
