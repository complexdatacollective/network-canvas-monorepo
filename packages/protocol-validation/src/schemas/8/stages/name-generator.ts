import { z } from 'zod';

import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import {
  StageNodeSyntheticSchema,
  type SyntheticCount,
} from '../codebook/synthetic.ts';
import {
  FormSchema,
  NodeStageSubjectSchema,
  nameGeneratorPromptSchema,
  panelSchema,
} from '../common/index.ts';
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
 * The node counts a synthetic count declaration can actually land on, as an
 * inclusive [floor, ceiling] window. A constant names one value and uniform
 * declares both ends; for the clamped families an explicit bound pins its
 * side, while an unbounded side falls back to the distribution's own support
 * — every family draws non-negative counts, and nothing but an explicit
 * `max` caps a poisson or normal draw from above.
 */
const syntheticCountRange = (
  count: SyntheticCount,
): { floor: number; ceiling: number } => {
  switch (count.distribution) {
    case 'constant':
      return { floor: count.value, ceiling: count.value };
    case 'uniform':
      return { floor: count.min, ceiling: count.max };
    case 'poisson':
    case 'normal':
      return {
        floor: count.min ?? 0,
        ceiling: count.max ?? Number.POSITIVE_INFINITY,
      };
  }
};

/**
 * Shared by every name generator that carries BOTH a behaviours window and a
 * declared synthetic count: the count must be reachable inside the window.
 *
 * The live interface enforces the window — nominations are hard-capped at
 * `maxNodes`, and the stage refuses to advance below `minNodes` — so a count
 * wholly outside it describes a session no participant could ever produce.
 * The planner clamps a drawn count into the same window, replacing the
 * authored count in silence: a constant of 20 under `maxNodes: 5` generates
 * exactly 5 nodes with no error, the same fault a degenerate mean outside
 * its truncation window declares (and the count schemas reject).
 */
export const requireCountReachableWithinBehaviours = (
  stage: {
    behaviours?: { minNodes?: number; maxNodes?: number };
    synthetic?: { count: SyntheticCount };
  },
  ctx: z.RefinementCtx,
) => {
  const count = stage.synthetic?.count;
  if (count === undefined) return;
  const { minNodes, maxNodes } = stage.behaviours ?? {};
  const { floor, ceiling } = syntheticCountRange(count);
  if (maxNodes !== undefined && floor > maxNodes) {
    ctx.addIssue({
      code: 'custom' as const,
      message: `This count always draws at least ${floor} nodes, and behaviours.maxNodes caps this stage at ${maxNodes} — no session can produce it`,
      path: ['synthetic', 'count'],
    });
  }
  if (minNodes !== undefined && ceiling < minNodes) {
    ctx.addIssue({
      code: 'custom' as const,
      message: `This count can reach at most ${ceiling} nodes, and behaviours.minNodes requires at least ${minNodes} — no session can produce it`,
      path: ['synthetic', 'count'],
    });
  }
};

export const nameGeneratorStage = baseStageSchema
  .extend({
    type: z.literal('NameGenerator'),
    synthetic: StageNodeSyntheticSchema.optional(),
    form: FormSchema,
    subject: NodeStageSubjectSchema,
    panels: z
      .array(panelSchema)
      .optional()
      .superRefine((panels, ctx) => {
        if (panels) {
          // Check for duplicate panel IDs
          const duplicatePanelId = findDuplicateId(panels);
          if (duplicatePanelId) {
            ctx.addIssue({
              code: 'custom' as const,
              message: `Panels contain duplicate ID "${duplicatePanelId}"`,
              path: [],
            });
          }
        }
      }),
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
  })
  .superRefine(requireCountReachableWithinBehaviours);
