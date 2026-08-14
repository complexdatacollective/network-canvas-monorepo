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
        label: z.string().min(1),
        color: z.string().min(1),
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

      // A disease row maps ONE node variable to a colour and an inheritance
      // pattern. Two rows on one variable give the pedigree contradictory
      // answers for a single affected set — the genetics engine resolves one
      // inheritance pattern per variable, and the key rendered to the
      // participant lists that variable twice under different colours.
      const seenVariables = new Set<string>();
      // Labels are the participant-facing key, so two rows sharing a label are
      // indistinguishable on screen whatever they map to.
      const seenLabels = new Set<string>();
      for (const [index, disease] of diseases.entries()) {
        if (seenVariables.has(disease.variable)) {
          ctx.addIssue({
            code: 'custom' as const,
            message: `Diseases contain duplicate variable "${disease.variable}"`,
            path: [index, 'variable'],
          });
        } else {
          seenVariables.add(disease.variable);
        }

        const label = disease.label.trim().toLocaleLowerCase();
        if (seenLabels.has(label)) {
          ctx.addIssue({
            code: 'custom' as const,
            message: `Diseases contain duplicate label "${disease.label}"`,
            path: [index, 'label'],
          });
        } else {
          seenLabels.add(label);
        }
      }
    }),
});
