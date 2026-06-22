import { faker } from '@faker-js/faker';

import { getEdgeTypeId, getNodeVariableId } from '~/utils/mock-seeds';
import { findDuplicateId } from '~/utils/validation-helpers';
import { z } from '~/utils/zod-mock-extension';

import { NodeStageSubjectSchema } from '../common';
import {
  asEntityAttributeReference,
  entityAttributeReference,
} from '../entity-attribute-reference';
import { FilterSchema } from '../filters';
import { baseStageSchema } from './base';

export const narrativeStage = baseStageSchema.extend({
  type: z.literal('Narrative'),
  filter: FilterSchema.optional(),
  subject: NodeStageSubjectSchema,
  presets: z
    .array(
      z.strictObject({
        id: z.string(),
        label: z
          .string()
          .generateMock(() =>
            faker.helpers.arrayElement([
              'Sample Preset',
              'Network Overview',
              'Group Visualization',
              'Relationship Display',
            ]),
          ),
        layoutVariable: entityAttributeReference({
          subject: 'stageSubject',
        }).generateMock(() => asEntityAttributeReference(getNodeVariableId(0))),
        groupVariable: entityAttributeReference({ subject: 'stageSubject' })
          .optional()
          .generateMock(() => asEntityAttributeReference(getNodeVariableId(1))),
        edges: z
          .strictObject({
            display: z
              .array(z.string())
              .optional()
              .generateMock(() => [getEdgeTypeId(0), getEdgeTypeId(1)]),
          })
          .optional(),
        highlight: z
          .array(entityAttributeReference({ subject: 'stageSubject' }))
          .optional()
          .generateMock(() => [
            asEntityAttributeReference(getNodeVariableId(0)),
            asEntityAttributeReference(getNodeVariableId(1)),
          ]),
      }),
    )
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
  background: z
    .strictObject({
      concentricCircles: z
        .number()
        .int()
        .optional()
        .generateMock(() => faker.number.int({ min: 1, max: 5 })),
      skewedTowardCenter: z.boolean().optional(),
    })
    .optional(),
  behaviours: z
    .strictObject({
      freeDraw: z.boolean().optional(),
      allowRepositioning: z.boolean().optional(),
    })
    .optional(),
});
