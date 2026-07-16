import { z } from 'zod';

import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import {
  NodeStageSubjectSchema,
  nameGeneratorPromptSchema,
} from '../common/index.ts';
import { SortOrderSchema } from '../filters/index.ts';
import { baseStageSchema } from './base.ts';
import { nameGeneratorBehavioursSchema } from './name-generator.ts';

export const nameGeneratorRosterStage = baseStageSchema.extend({
  type: z.literal('NameGeneratorRoster'),
  subject: NodeStageSubjectSchema,
  dataSource: z.string().min(1),
  cardOptions: z
    .strictObject({
      additionalProperties: z
        .array(
          z.strictObject({
            label: z.string(),
            // External data-source (roster CSV) column, not a codebook variable.
            variable: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
  sortOptions: z
    .strictObject({
      sortOrder: SortOrderSchema.optional(),
      sortableProperties: z
        .array(
          z.strictObject({
            label: z.string(),
            // External data-source (roster CSV) column, not a codebook variable.
            variable: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
  searchOptions: z
    .strictObject({
      fuzziness: z.number(),
      // External data-source (roster CSV) column names, not codebook variables.
      matchProperties: z.array(z.string()).min(1),
    })
    .optional(),
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
