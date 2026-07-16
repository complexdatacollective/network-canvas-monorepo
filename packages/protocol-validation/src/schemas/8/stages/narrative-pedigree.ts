import { z } from 'zod';

import { INHERITANCE_PATTERNS } from '@codaco/shared-consts';

import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { baseStageSchema } from './base.ts';

export const narrativePedigreeStage = baseStageSchema.extend({
  type: z.literal('NarrativePedigree'),

  sourceStageId: z.string(),

  showAtRiskStatuses: z.boolean().default(false),

  diseases: z
    .array(
      z.strictObject({
        id: z.string(),
        label: z.string(),
        color: z.string(),
        variable: entityAttributeReference({ subject: 'stageSubject' }),
        inheritancePattern: z.enum([...INHERITANCE_PATTERNS]),
      }),
    )
    .min(1)
    .superRefine((diseases, ctx) => {
      const duplicateId = findDuplicateId(diseases);
      if (duplicateId) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `Diseases contain duplicate ID "${duplicateId}"`,
          path: [],
        });
      }
    }),
});
