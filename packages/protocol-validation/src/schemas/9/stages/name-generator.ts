import { z } from 'zod';

import {
  EVERY_VERSION,
  type MessageArguments,
} from '../../../localization/messageArguments.ts';
import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import {
  FormSchema,
  NodeStageSubjectSchema,
  nameGeneratorPromptSchema,
  panelsSchema,
} from '../common/index.ts';
import { localizedMessage, nonBlankText } from '../localized-string.ts';
import { SUBJECT_ARGUMENTS } from '../stage-wording/subject.ts';
import { baseStageSchema } from './base.ts';

// Shared by NameGenerator and NameGeneratorQuickAdd: a node-count window must be
// satisfiable (maxNodes >= minNodes), allow at least one node (maxNodes >= 1),
// and never demand a negative minimum.
export const nameGeneratorBehavioursSchema = z
  .strictObject({
    minNodes: z.number().int().min(0).optional(),
    maxNodes: z.number().int().min(1).optional(),
  })
  .superRefine((behaviours, ctx) => {
    if (
      behaviours.minNodes !== undefined &&
      behaviours.maxNodes !== undefined &&
      behaviours.maxNodes < behaviours.minNodes
    ) {
      ctx.addIssue({
        code: 'custom' as const,
        message: 'maxNodes must be greater than or equal to minNodes.',
        path: ['maxNodes'],
      });
    }
  })
  .optional();

/**
 * What a minimum's notice may use: how many nodes are needed, which it must
 * show, and the name of the stage's node type.
 */
export const MIN_NODES_ARGUMENTS: MessageArguments = {
  count: { kind: 'plural', required: EVERY_VERSION },
  ...SUBJECT_ARGUMENTS,
};

/**
 * What a maximum's notice may use: the most nodes the stage takes, and the
 * name of its node type.
 */
export const MAX_NODES_ARGUMENTS: MessageArguments = {
  count: { kind: 'plural' },
  ...SUBJECT_ARGUMENTS,
};

/**
 * The words a name generator shows about its limits,
 * which Network Canvas supplies (`stage-wording/name-generator.ts`). Each is
 * shown only in some configurations; a stage that omits one shows Network
 * Canvas's wording.
 */
export const nameGeneratorWording = {
  minNodesNotice: localizedMessage(nonBlankText(), {
    arguments: MIN_NODES_ARGUMENTS,
  }).optional(),
  maxNodesNotice: localizedMessage(nonBlankText(), {
    arguments: MAX_NODES_ARGUMENTS,
  }).optional(),
};

export const nameGeneratorStage = baseStageSchema.extend({
  type: z.literal('NameGenerator'),
  form: FormSchema,
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
  ...nameGeneratorWording,
});
