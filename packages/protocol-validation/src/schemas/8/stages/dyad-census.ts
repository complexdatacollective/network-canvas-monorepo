import { z } from 'zod';

import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import {
  dyadCensusPromptSchema,
  IntroductionPanelSchema,
  NodeStageSubjectSchema,
} from '../common/index.ts';
import { FilterSchema } from '../filters/index.ts';
import { baseStageSchema } from './base.ts';

export const dyadCensusStage = baseStageSchema.extend({
  type: z.literal('DyadCensus'),
  subject: NodeStageSubjectSchema,
  filter: FilterSchema.optional(),
  prompts: z
    .array(dyadCensusPromptSchema)
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
  introductionPanel: IntroductionPanelSchema,
});
