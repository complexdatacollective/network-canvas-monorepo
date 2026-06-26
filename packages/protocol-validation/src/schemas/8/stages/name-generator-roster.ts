import { z } from 'zod';

import { findDuplicateId } from '~/utils/validation-helpers';

import { NodeStageSubjectSchema, nameGeneratorPromptSchema } from '../common';
import { SortOrderSchema } from '../filters';
import { baseStageSchema } from './base';

export const nameGeneratorRosterStage = baseStageSchema.extend({
  type: z.literal('NameGeneratorRoster'),
  subject: NodeStageSubjectSchema,
  dataSource: z.string(),
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
      matchProperties: z.array(z.string()),
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
  behaviours: z
    .strictObject({
      minNodes: z.number().int().optional(),
      maxNodes: z.number().int().optional(),
    })
    .optional(),
});
