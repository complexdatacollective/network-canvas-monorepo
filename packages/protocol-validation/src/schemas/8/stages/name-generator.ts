import { z } from 'zod';

import { MAX_SYNTHETIC_POPULATION } from '../../../shared/synthetic/helpers.ts';
import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import {
  FormSchema,
  NodeStageSubjectSchema,
  nameGeneratorPromptSchema,
  panelSchema,
} from '../common/index.ts';
import { syntheticCountSupport } from '../synthetic/helpers.ts';
import {
  type BurdenedStageType,
  DEFAULT_NOMINATION_MEAN,
  DEFAULT_NOMINATION_SD,
  DEFAULT_RESPONSE_BURDEN,
  stageNodeSynthetic,
  type SyntheticCount,
} from '../synthetic/index.ts';
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
 * Every count a name generator can draw must lie inside its behaviours window.
 *
 * The live interface enforces the window — nominations are hard-capped at
 * `maxNodes`, and the stage refuses to advance below `minNodes` — so a draw
 * outside it describes a session no participant could have produced. Requiring
 * CONTAINMENT rather than mere overlap is what lets generation take a count at
 * face value: were an overlapping count admitted, `uniform 1..20` under
 * `maxNodes: 3` would validate and then have to be clamped at generation time,
 * piling every overshooting draw onto the cap and silently replacing the
 * distribution the author declared with a spike at 3.
 *
 * Runs AFTER {@link withResolvedSyntheticCount}, so it judges the count as
 * resolved rather than as written. An open-tailed family that declares no
 * bound of its own has one filled in from this very window, and passes; what
 * this catches is a bound the author DID declare that the window contradicts —
 * `poisson mean 2, max: 20` under `maxNodes: 3`, where the two say different
 * things and only the author can say which was meant.
 */
export const requireCountWithinBehaviours = (
  stage: {
    behaviours?: { minNodes?: number; maxNodes?: number };
    synthetic?: { count?: SyntheticCount };
  },
  ctx: z.RefinementCtx,
) => {
  const count = stage.synthetic?.count;
  if (count === undefined) return;
  const { minNodes, maxNodes } = stage.behaviours ?? {};
  const { floor, ceiling } = syntheticCountSupport(count);
  if (maxNodes !== undefined && ceiling > maxNodes) {
    ctx.addIssue({
      code: 'custom' as const,
      message: `This count can draw up to ${ceiling} nodes, and behaviours.maxNodes caps this stage at ${maxNodes} — give the count a maximum of ${maxNodes} or lower`,
      path: ['synthetic', 'count'],
    });
  }
  // A `minNodes` above `MAX_SYNTHETIC_POPULATION` is a window NO count can
  // satisfy — the count schemas cap every bound at the population ceiling —
  // so flagging the count would make the protocol invalid over something no
  // author can fix here. Such a stage was valid before generation parameters
  // existed and stays valid now; the feasibility gate refuses GENERATION for
  // it instead, naming the ceiling (`populationConflicts`).
  if (
    minNodes !== undefined &&
    minNodes <= MAX_SYNTHETIC_POPULATION &&
    floor < minNodes
  ) {
    ctx.addIssue({
      code: 'custom' as const,
      message: `This count can draw as few as ${floor} nodes, and behaviours.minNodes requires at least ${minNodes} — give the count a minimum of ${minNodes} or higher`,
      path: ['synthetic', 'count'],
    });
  }
};

/**
 * An open-tailed count must be able to return values around its own mean.
 *
 * Filling a missing bound from the stage's window can otherwise produce a
 * declaration that is arithmetically fine and statistically meaningless: a
 * `normal mean 8` on a stage requiring at least 30 nominations resolves to
 * `normal mean 8, min 30`, whose every draw clamps to 30. That is a constant
 * wearing a distribution's clothes, and — unlike the containment rule, which
 * catches a conflict between two things the AUTHOR wrote — nothing else would
 * report it, because the bound that causes it was supplied here.
 *
 * A floor of zero is exempt: a negative mean with spread is the sanctioned way
 * to say "usually none, occasionally a few", and the count schemas admit it
 * deliberately.
 *
 * Runs after {@link withResolvedSyntheticCount}, on the resolved bounds.
 */
export const requireDrawableCount = (
  stage: { synthetic?: { count: SyntheticCount } },
  ctx: z.RefinementCtx,
) => {
  const count = stage.synthetic?.count;
  if (count?.distribution !== 'poisson' && count?.distribution !== 'normal') {
    return;
  }

  const { mean, min, max } = count;
  if (min !== undefined && min > 0 && mean < min) {
    ctx.addIssue({
      code: 'custom' as const,
      message: `A mean of ${mean} lies below the ${min} nodes this stage requires, so every draw would return ${min}`,
      path: ['synthetic', 'count', 'mean'],
    });
  }
  if (max !== undefined && mean > max) {
    ctx.addIssue({
      code: 'custom' as const,
      message: `A mean of ${mean} lies above the ${max} nodes this count is bounded to, so every draw would return ${max}`,
      path: ['synthetic', 'count', 'mean'],
    });
  }
};

/**
 * The count a name generator that declares none is read as having: the shared
 * default distribution, truncated to the stage's own window.
 *
 * The mean is held INSIDE that window rather than left where the default put
 * it. A stage capped at three nominations cannot average eight, and a default
 * that said so would be rejected by `requireDrawableCount` — making a protocol
 * invalid for something its author never wrote. Pinning the mean to the
 * nearest bound keeps the default valid for every window an author can set,
 * at the cost of a distribution that leans against that bound when the window
 * is tight, which is the honest reading of a tight window.
 *
 * Bounds are held to `MAX_SYNTHETIC_POPULATION`, since a count is what the
 * generator materialises: `behaviours` bounds what a participant may enter and
 * carries no such cap, so a stage allowing thousands of nominations still
 * defaults to a population generation can actually build.
 */
export const defaultNodeCount = (behaviours?: {
  minNodes?: number;
  maxNodes?: number;
}): SyntheticCount => {
  const min = Math.min(behaviours?.minNodes ?? 0, MAX_SYNTHETIC_POPULATION);
  const max = Math.min(
    behaviours?.maxNodes ?? MAX_SYNTHETIC_POPULATION,
    MAX_SYNTHETIC_POPULATION,
  );

  return {
    distribution: 'normal',
    mean: Math.min(Math.max(DEFAULT_NOMINATION_MEAN, min), max),
    sd: DEFAULT_NOMINATION_SD,
    min,
    max,
  };
};

/**
 * Give an open-tailed count the bounds it did not declare.
 *
 * `constant` and `uniform` pin their own support, but a Poisson or a normal
 * reaches indefinitely past its mean, so an undeclared bound is an unbounded
 * one. Filling it from the stage's own window — and from
 * `MAX_SYNTHETIC_POPULATION` where the stage sets no window — is what makes
 * `poisson mean 2` a usable declaration rather than one an author must
 * hand-bound before it will validate.
 *
 * A declared bound is never overwritten: it is the author's, and the
 * containment rule holds it to the window rather than quietly rewriting it.
 */
const withResolvedBounds = (
  count: SyntheticCount,
  behaviours?: { minNodes?: number; maxNodes?: number },
): SyntheticCount => {
  if (count.distribution !== 'poisson' && count.distribution !== 'normal') {
    return count;
  }

  return {
    ...count,
    min: count.min ?? behaviours?.minNodes ?? 0,
    max: Math.min(
      count.max ?? behaviours?.maxNodes ?? MAX_SYNTHETIC_POPULATION,
      MAX_SYNTHETIC_POPULATION,
    ),
  };
};

/**
 * Resolve a name generator's synthetic count: supply one where the stage
 * declared none, and bound it where the family leaves it open.
 *
 * Applied as a transform rather than field-level `.default()`s because both
 * halves depend on a SIBLING field. A default that ignored `behaviours` would
 * be rejected by the containment rule on any stage with a narrow window,
 * making a protocol invalid for something its author never wrote; and a bound
 * that ignored it would cap a stage at the population ceiling when its own
 * window says three.
 *
 * Downstream this is what lets generation read `stage.synthetic.count`
 * directly — the field is required in the parsed type — with no fallback of
 * its own and no clamping: every bound the sampler needs is present in the
 * protocol, and visible there.
 *
 * `responseBurden` is carried through the same way, and for the same reason:
 * the field-level default only fires when a `synthetic` block is present, and
 * a name generator's block is optional precisely so that a stage may declare
 * no count. Reading the stage's OWN `type` rather than taking the stage type
 * as an argument keeps the three name generators sharing one transform while
 * each still resolves to its own burden.
 */
export const withResolvedSyntheticCount = <
  T extends {
    type: BurdenedStageType;
    behaviours?: { minNodes?: number; maxNodes?: number };
    synthetic?: { count?: SyntheticCount; responseBurden: number };
  },
>(
  stage: T,
): T & {
  synthetic: {
    generatesData: true;
    responseBurden: number;
    count: SyntheticCount;
  };
} => ({
  ...stage,
  synthetic: {
    generatesData: true,
    responseBurden:
      stage.synthetic?.responseBurden ?? DEFAULT_RESPONSE_BURDEN[stage.type],
    count: withResolvedBounds(
      stage.synthetic?.count ?? defaultNodeCount(stage.behaviours),
      stage.behaviours,
    ),
  },
});

export const nameGeneratorStage = baseStageSchema
  .extend({
    type: z.literal('NameGenerator'),
    synthetic: stageNodeSynthetic('NameGenerator').optional(),
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
  .transform(withResolvedSyntheticCount)
  .superRefine(requireCountWithinBehaviours)
  .superRefine(requireDrawableCount);
