import { z } from 'zod';

import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import {
  NodeStageSubjectSchema,
  nameGeneratorPromptSchema,
  panelsSchema,
} from '../common/index.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { localizedMessage, nonBlankText } from '../localized-string.ts';
import { SUBJECT_ARGUMENTS } from '../stage-wording/subject.ts';
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
    // What the quick-add field shows before anything is typed in it, which
    // Network Canvas supplies (`stage-wording/name-generator-quick-add.ts`).
    // Every quick-add stage has the field, so it is always required. Worded by
    // each stage, since what is typed depends on the attribute it fills. The
    // line under the field, which every quick-add stage shows alike, is
    // interface text (`interface-text-wording.ts`).
    addNamePlaceholder: localizedMessage(nonBlankText(), {
      arguments: SUBJECT_ARGUMENTS,
    }),
    ...nameGeneratorWording,
  })
  .superRefine(requireNameGeneratorWording);
