import { z } from 'zod';

import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import {
  NodeStageSubjectSchema,
  nameGeneratorPromptSchema,
  panelSchema,
} from '../common/index.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { baseStageSchema } from './base.ts';
import { nameGeneratorBehavioursSchema } from './name-generator.ts';

export const nameGeneratorQuickAddStage = baseStageSchema.extend({
  type: z.literal('NameGeneratorQuickAdd'),
  quickAdd: entityAttributeReference({
    subject: 'stageSubject',
  }),
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
