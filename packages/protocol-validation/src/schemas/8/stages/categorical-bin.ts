import { z } from 'zod';

import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import {
  categoricalBinPromptSchema,
  NodeStageSubjectSchema,
} from '../common/index.ts';
import { FilterSchema } from '../filters/index.ts';
import { stageValuesSynthetic } from '../synthetic/index.ts';
import { baseStageSchema } from './base.ts';

export const categoricalBinStage = baseStageSchema.extend({
  type: z.literal('CategoricalBin'),
  synthetic: stageValuesSynthetic('CategoricalBin').prefault({}),
  subject: NodeStageSubjectSchema,
  filter: FilterSchema.optional(),
  prompts: z
    .array(categoricalBinPromptSchema)
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
