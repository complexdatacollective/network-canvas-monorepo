import { z } from 'zod';

import {
  INHERITANCE_PATTERNS,
  normalizeForComparison,
} from '@codaco/shared-consts';

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
      //
      // `normalizeForComparison`, never `toLocaleLowerCase()`: this is a
      // PERSISTED-SCHEMA invariant, so the answer has to be the same on every
      // device the protocol is opened on. Locale folding makes it depend on the
      // host — `I` lowercases to `ı` under Turkish and Azeri, so `Ilk` and
      // `ilk` collide on one laptop and not on another — and the raw
      // comparison it replaces also missed canonically equivalent spellings of
      // the same label, which render identically to the participant. The
      // editor and the repair use the same helper, so the three cannot drift.
      const seenLabels = new Set<string>();
      for (const [index, disease] of diseases.entries()) {
        if (seenVariables.has(disease.variable)) {
          ctx.addIssue({
            code: 'custom' as const,
            message: `Diseases contain duplicate attribute "${disease.variable}"`,
            path: [index, 'variable'],
          });
        } else {
          seenVariables.add(disease.variable);
        }

        const label = normalizeForComparison(disease.label.trim());
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
