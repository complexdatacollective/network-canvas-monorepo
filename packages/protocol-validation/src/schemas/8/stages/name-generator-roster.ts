import { faker } from '@faker-js/faker';

import { getAssetId } from '~/utils/mock-seeds';
import { findDuplicateId } from '~/utils/validation-helpers';
import { z } from '~/utils/zod-mock-extension';

import { NodeStageSubjectSchema, nameGeneratorPromptSchema } from '../common';
import {
  asEntityAttributeReference,
  entityAttributeReference,
} from '../entity-attribute-reference';
import { SortOrderSchema } from '../filters';
import { baseStageSchema } from './base';

export const nameGeneratorRosterStage = baseStageSchema.extend({
  type: z.literal('NameGeneratorRoster'),
  subject: NodeStageSubjectSchema,
  dataSource: z.string().generateMock(() => getAssetId()),
  cardOptions: z
    .strictObject({
      additionalProperties: z
        .array(
          z.strictObject({
            label: z.string(),
            variable: entityAttributeReference({ subject: 'stageSubject' }),
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
            variable: entityAttributeReference({ subject: 'stageSubject' }),
          }),
        )
        .optional(),
    })
    .optional(),
  searchOptions: z
    .strictObject({
      fuzziness: z
        .number()
        .generateMock(() =>
          faker.number.float({ multipleOf: 0.25, min: 0, max: 1 }),
        ),
      matchProperties: z
        .array(entityAttributeReference({ subject: 'stageSubject' }))
        .generateMock(() =>
          faker.helpers
            .arrayElement([
              ['name', 'first_name', 'last_name'],
              ['website', 'country', 'name'],
              ['email', 'name'],
            ])
            .map(asEntityAttributeReference),
        ),
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
