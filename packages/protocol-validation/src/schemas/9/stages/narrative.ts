import { z } from 'zod';

import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import { canvasBehavioursSchema } from '../common/behaviours.ts';
import {
  imageOrCirclesBackgroundSchema,
  NodeStageSubjectSchema,
} from '../common/index.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { entityTypeReference } from '../entity-type-reference.ts';
import { FilterSchema } from '../filters/index.ts';
import { localizedString, nonBlankText } from '../localized-string.ts';
import { baseStageSchema } from './base.ts';

export const narrativeStage = baseStageSchema.extend({
  type: z.literal('Narrative'),
  filter: FilterSchema.optional(),
  subject: NodeStageSubjectSchema,
  presets: z
    .array(
      z.strictObject({
        id: z.string(),
        label: localizedString(z.string().min(1), 'plain'),
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
          .array(
            z.strictObject({
              variable: entityAttributeReference({ subject: 'stageSubject' }),
              label: localizedString(z.string().min(1), 'plain'),
            }),
          )
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
  background: imageOrCirclesBackgroundSchema,
  behaviours: canvasBehavioursSchema,
  // The interview's own words on this stage, which Network Canvas supplies
  // (`stage-wording/narrative.ts`). Each is required only while the stage
  // shows it, which the protocol checks (`missingRequiredStageSettings`): the
  // headings while a preset has the content they head, and the tooltips while
  // the stage's behaviours turn on the controls they name.
  attributesHeading: localizedString(nonBlankText(), 'plain').optional(),
  linksHeading: localizedString(nonBlankText(), 'plain').optional(),
  groupsHeading: localizedString(nonBlankText(), 'plain').optional(),
  tooltips: z
    .strictObject({
      enableDrawing: localizedString(nonBlankText(), 'plain').optional(),
      disableDrawing: localizedString(nonBlankText(), 'plain').optional(),
      freezeAnnotations: localizedString(nonBlankText(), 'plain').optional(),
      unfreezeAnnotations: localizedString(nonBlankText(), 'plain').optional(),
      resetAnnotations: localizedString(nonBlankText(), 'plain').optional(),
      pauseLayout: localizedString(nonBlankText(), 'plain').optional(),
      resumeLayout: localizedString(nonBlankText(), 'plain').optional(),
    })
    .optional(),
});
