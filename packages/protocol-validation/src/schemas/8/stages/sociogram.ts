import { z } from 'zod';

import { findDuplicateId } from '~/utils/validation-helpers';

import { NodeStageSubjectSchema, sociogramPromptSchema } from '../common';
import { FilterSchema } from '../filters';
import { baseStageSchema } from './base';

export const sociogramStage = baseStageSchema.extend({
  type: z.literal('Sociogram'),
  subject: NodeStageSubjectSchema,
  filter: FilterSchema.optional(),
  background: z
    .strictObject({
      image: z.string().optional(),
      concentricCircles: z.number().int().optional(),
      skewedTowardCenter: z.boolean().optional(),
    })
    .optional(),
  behaviours: z
    .strictObject({
      automaticLayout: z.strictObject({ enabled: z.boolean() }).optional(),
    })
    .catchall(z.any())
    .optional(),
  prompts: z
    .array(sociogramPromptSchema)
    .min(1)
    .superRefine((prompts, ctx) => {
      // Check for duplicate prompt IDs
      const duplicatePromptId = findDuplicateId(prompts);
      if (duplicatePromptId) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `Prompts contain duplicate ID "${duplicatePromptId}"`,
          path: [],
        });
      }

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
});
