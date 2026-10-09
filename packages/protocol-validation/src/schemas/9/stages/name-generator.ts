import { z } from 'zod';

import type { MessageArguments } from '../../../localization/messageArguments.ts';
import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import {
  FormSchema,
  NodeStageSubjectSchema,
  nameGeneratorPromptSchema,
  panelsSchema,
} from '../common/index.ts';
import {
  localizedMessage,
  localizedString,
  nonBlankText,
} from '../localized-string.ts';
import {
  hasExternalPanels,
  hasMinimumNodes,
  hasMaximumNodes,
  requireWhenShown,
  type StageRecord,
} from '../stage-wording/conditions.ts';
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

/** What a minimum's notice may use: how many people are still needed. */
export const NODE_COUNT_ARGUMENTS = {
  count: { kind: 'plural' },
} as const satisfies MessageArguments;

/**
 * The words a name generator shows about its limits and its side panels,
 * which Network Canvas supplies (`stage-wording/name-generator.ts`). Each is
 * shown only in some configurations, so each is required only while its
 * configuration is on (`requireNameGeneratorWording`).
 */
export const nameGeneratorWording = {
  minNodesNotice: localizedMessage(nonBlankText(), {
    arguments: NODE_COUNT_ARGUMENTS,
  }).optional(),
  maxNodesNotice: localizedString(nonBlankText(), 'plain').optional(),
  externalDataError: localizedString(nonBlankText(), 'plain').optional(),
};

/** Refuses a name generator that shows a setting it does not hold. */
export const requireNameGeneratorWording = (
  stage: StageRecord,
  ctx: z.RefinementCtx,
): void =>
  requireWhenShown(stage, ctx, [
    {
      name: 'minNodesNotice',
      when: hasMinimumNodes,
      message: 'A stage with a minimum needs a minimum notice.',
    },
    {
      name: 'maxNodesNotice',
      when: hasMaximumNodes,
      message: 'A stage with a maximum needs a maximum notice.',
    },
    {
      name: 'externalDataError',
      when: hasExternalPanels,
      message: 'A stage with an external panel needs a loading error.',
    },
  ]);

export const nameGeneratorStage = baseStageSchema
  .extend({
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
  })
  .superRefine(requireNameGeneratorWording);
