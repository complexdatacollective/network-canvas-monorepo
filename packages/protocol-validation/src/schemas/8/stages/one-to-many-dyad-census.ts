import { z } from 'zod';

import { findDuplicateId } from '~/utils/validation-helpers';

import {
  NodeStageSubjectSchema,
  oneToManyDyadCensusPromptSchema,
} from '../common';
import { FilterSchema } from '../filters';
import { baseStageSchema } from './base';

export const oneToManyDyadCensusStage = baseStageSchema.extend({
  type: z.literal('OneToManyDyadCensus'),
  filter: FilterSchema.optional(),
  subject: NodeStageSubjectSchema,
  behaviours: z.strictObject({
    removeAfterConsideration: z.boolean(),
  }),
  prompts: z
    .array(oneToManyDyadCensusPromptSchema)
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
