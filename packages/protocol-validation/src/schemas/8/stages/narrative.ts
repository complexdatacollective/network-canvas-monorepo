import { z } from 'zod';

import { findDuplicateId } from '~/utils/validation-helpers';

import { NodeStageSubjectSchema } from '../common';
import { canvasBehavioursSchema } from '../common/behaviours';
import { entityAttributeReference } from '../entity-attribute-reference';
import { entityTypeReference } from '../entity-type-reference';
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
        label: z.string(),
        layoutVariable: entityAttributeReference({
          subject: 'stageSubject',
        }),
        groupVariable: entityAttributeReference({
          subject: 'stageSubject',
        }).optional(),
        edges: z
          .strictObject({
            display: z
              .array(entityTypeReference({ entity: 'edge' }))
              .optional(),
          })
          .optional(),
        highlight: z
          .array(entityAttributeReference({ subject: 'stageSubject' }))
          .optional(),
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
  background: z.strictObject({
    concentricCircles: z.number().int().nonnegative(),
    skewedTowardCenter: z.boolean().optional(),
  }),
  behaviours: canvasBehavioursSchema,
});
