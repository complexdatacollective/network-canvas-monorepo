import { z } from 'zod';

import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import {
  NodeStageSubjectSchema,
  ordinalBinPromptSchema,
} from '../common/index.ts';
import { FilterSchema } from '../filters/index.ts';
import { baseStageSchema } from './base.ts';

export const ordinalBinStage = baseStageSchema.extend({
  type: z.literal('OrdinalBin'),
  subject: NodeStageSubjectSchema,
  filter: FilterSchema.optional(),
  prompts: z
    .array(ordinalBinPromptSchema)
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
});
