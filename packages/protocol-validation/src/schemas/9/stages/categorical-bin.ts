import { z } from 'zod';

import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import { binBehavioursSchema } from '../common/behaviours.ts';
import {
  categoricalBinPromptSchema,
  NodeStageSubjectSchema,
} from '../common/index.ts';
import { FilterSchema } from '../filters/index.ts';
import { baseStageSchema } from './base.ts';

export const categoricalBinStage = baseStageSchema.extend({
  type: z.literal('CategoricalBin'),
  subject: NodeStageSubjectSchema,
  filter: FilterSchema.optional(),
  behaviours: binBehavioursSchema,
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
