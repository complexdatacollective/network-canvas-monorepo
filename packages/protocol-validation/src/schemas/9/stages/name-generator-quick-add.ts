import { z } from 'zod';

import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import {
  NodeStageSubjectSchema,
  nameGeneratorPromptSchema,
  panelsSchema,
} from '../common/index.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { localizedString, nonBlankText } from '../localized-string.ts';
import { baseStageSchema } from './base.ts';
import {
  nameGeneratorBehavioursSchema,
  nameGeneratorWording,
  requireNameGeneratorWording,
} from './name-generator.ts';

export const nameGeneratorQuickAddStage = baseStageSchema
  .extend({
    type: z.literal('NameGeneratorQuickAdd'),
    quickAdd: entityAttributeReference({
      subject: 'stageSubject',
      usage: 'validatedAttribute',
    }),
    subject: NodeStageSubjectSchema,
    panels: panelsSchema,
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
    // The line under the quick-add field, which Network Canvas supplies
    // (`stage-wording/name-generator-quick-add.ts`): every quick-add stage has
    // the field, so the hint is always required.
    quickAddHint: localizedString(nonBlankText(), 'plain'),
    ...nameGeneratorWording,
  })
  .superRefine(requireNameGeneratorWording);
