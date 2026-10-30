import { z } from 'zod';

import { findDuplicateId } from '../../utils/validation-helpers.ts';
import { assetSchema } from './assets/index.ts';
import { CodebookSchema } from './codebook/index.ts';
import { ExperimentsSchema } from './common/index.ts';
import { InterfaceTextSchema } from './interface-text.ts';
import { ProtocolLocalizationSchema } from './localized-string.ts';
import { stageSchema } from './stages/index.ts';
import { missingRequiredStageSettings } from './supplied-stage-text.ts';
import { findTimelineStructureProblems } from './timeline-structure.ts';

/**
 * The shape of a protocol, with the checks that need nothing beyond it.
 *
 * `schema.ts` adds the checks that read across the protocol, and those call the
 * reference walkers in `utils/`, which walk this schema. Holding the shape here
 * keeps the walkers from having to import the module that calls them.
 */
export const ProtocolStructureSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string().optional(),
  localization: ProtocolLocalizationSchema,
  experiments: ExperimentsSchema.optional(),
  lastModified: z.string().datetime().optional(),
  codebook: CodebookSchema,
  // The interview's words that belong to no one stage (see
  // `interface-text.ts`). Architect keeps it holding what the protocol
  // uses; the interview shows its own words for anything it lacks.
  interfaceText: InterfaceTextSchema.optional(),
  assetManifest: z.record(z.string(), assetSchema).optional(),
  stages: z.array(stageSchema).superRefine((stages, ctx) => {
    // Check for duplicate stage IDs
    const duplicateStageId = findDuplicateId(stages);
    if (duplicateStageId) {
      ctx.addIssue({
        code: 'custom' as const,
        message: `Stages contain duplicate ID "${duplicateStageId}"`,
        path: [],
      });
    }

    // A setting the interview shows on a stage is written there. The stage
    // must hold it wherever its configuration shows it (see
    // `missingRequiredStageSettings`).
    stages.forEach((stage, index) => {
      for (const path of missingRequiredStageSettings(stage)) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `The interview shows this stage's "${path.join('.')}" setting, so the stage must hold it.`,
          path: [index, ...path],
        });
      }
    });

    // Every route ends at a finish stage, and every stage is on a route.
    for (const problem of findTimelineStructureProblems(stages)) {
      switch (problem.kind) {
        case 'empty':
          ctx.addIssue({
            code: 'custom' as const,
            message:
              'A protocol must have at least one stage: a finish stage to end the interview.',
            path: [],
          });
          break;
        case 'no-finish':
          ctx.addIssue({
            code: 'custom' as const,
            message:
              'The interview must end with a finish stage, but it ends after this stage.',
            path: [problem.stageIndex],
          });
          break;
        case 'unreachable':
          ctx.addIssue({
            code: 'custom' as const,
            message: `This stage comes after the finish stage at position ${problem.finishStageIndex + 1}, so no participant can reach it.`,
            path: [problem.stageIndex],
          });
          break;
      }
    }
  }),
  schemaVersion: z.literal(9),
});
