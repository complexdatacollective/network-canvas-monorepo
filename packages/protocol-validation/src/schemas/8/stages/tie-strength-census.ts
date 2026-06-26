import { z } from 'zod';

import { findDuplicateId } from '~/utils/validation-helpers';

import {
  IntroductionPanelSchema,
  NodeStageSubjectSchema,
  tieStrengthCensusPromptSchema,
} from '../common';
import { FilterSchema } from '../filters';
import { baseStageSchema } from './base';

export const tieStrengthCensusStage = baseStageSchema.extend({
  type: z.literal('TieStrengthCensus'),
  subject: NodeStageSubjectSchema,
  filter: FilterSchema.optional(),
  prompts: z
    .array(tieStrengthCensusPromptSchema)
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
