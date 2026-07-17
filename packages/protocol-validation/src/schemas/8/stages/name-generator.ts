import { z } from 'zod';

import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import {
  FormSchema,
  NodeStageSubjectSchema,
  nameGeneratorPromptSchema,
  panelSchema,
} from '../common/index.ts';
import { baseStageSchema } from './base.ts';

// Shared by NameGenerator and NameGeneratorQuickAdd: a node-count window must be
// satisfiable (maxNodes >= minNodes), allow at least one node (maxNodes >= 1),
// and never demand a negative minimum.
export const nameGeneratorBehavioursSchema = z
  .strictObject({
    minNodes: z.number().int().min(0).optional(),
    maxNodes: z.number().int().min(1).optional(),
  })
  .superRefine((behaviours, ctx) => {
    if (
      behaviours.minNodes !== undefined &&
      behaviours.maxNodes !== undefined &&
      behaviours.maxNodes < behaviours.minNodes
    ) {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'maxNodes must be greater than or equal to minNodes.',
        path: ['maxNodes'],
      });
    }
  })
  .optional();

export const nameGeneratorStage = baseStageSchema.extend({
  type: z.literal('NameGenerator'),
  form: FormSchema,
  subject: NodeStageSubjectSchema,
  panels: z
    .array(panelSchema)
    .optional()
    .superRefine((panels, ctx) => {
      if (panels) {
        // Check for duplicate panel IDs
        const duplicatePanelId = findDuplicateId(panels);
        if (duplicatePanelId) {
          ctx.addIssue({
            code: 'custom' as const,
            message: `Panels contain duplicate ID "${duplicatePanelId}"`,
            path: [],
          });
        }
      }
    }),
  prompts: z
    .array(nameGeneratorPromptSchema)
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
    }),
  behaviours: nameGeneratorBehavioursSchema,
});
