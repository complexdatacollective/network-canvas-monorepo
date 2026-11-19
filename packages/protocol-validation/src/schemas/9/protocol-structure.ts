import { z } from 'zod';

import {
  collectProtocolObjectIdsFromSchema,
  groupDuplicateProtocolObjectIds,
  reportDuplicateProtocolObjectIds,
} from '../../utils/protocolObjectIds.ts';
import { assetSchema } from './assets/index.ts';
import { CodebookSchema } from './codebook/index.ts';
import { ExperimentsSchema } from './common/index.ts';
import { InterfaceTextSchema } from './interface-text.ts';
import { ProtocolLocalizationSchema } from './localized-string.ts';
import { stageSchema } from './stages/index.ts';
import { findTimelineStructureProblems } from './timeline-structure.ts';

/**
 * The shape of a protocol, with the checks that need nothing beyond it.
 *
 * `schema.ts` adds the checks that read across the protocol, and those call the
 * reference walkers in `utils/`, which walk this schema. Holding the shape here
 * keeps the walkers from having to import the module that calls them.
 */
const protocolStructureShape = z.strictObject({
  name: z.string().min(1),
  description: z.string().optional(),
  localization: ProtocolLocalizationSchema,
  experiments: ExperimentsSchema.optional(),
  lastModified: z.string().datetime().optional(),
  codebook: CodebookSchema,
  // The interview's words that belong to no one stage (see
  // `interface-text.ts`). A protocol may hold any of them, or none: the
  // interview shows Network Canvas's own wording for what it omits.
  interfaceText: InterfaceTextSchema.optional(),
  assetManifest: z.record(z.string(), assetSchema).optional(),
  stages: z.array(stageSchema).superRefine((stages, ctx) => {
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

const stageIndexOf = (
  path: readonly (string | number)[],
): number | undefined =>
  path[0] === 'stages' && typeof path[1] === 'number' ? path[1] : undefined;

/**
 * One id used by two objects anywhere in the protocol is refused, with an
 * issue at each. A repeat whose every use is inside one stage is left to that
 * stage's own refinement (`withUniqueObjectIds`), which reports it already.
 */
export const ProtocolStructureSchema = protocolStructureShape.superRefine(
  (protocol, ctx) => {
    const duplicates = groupDuplicateProtocolObjectIds(
      collectProtocolObjectIdsFromSchema(protocolStructureShape, protocol),
    ).filter(({ paths }) => {
      const stageIndex = stageIndexOf(paths[0] ?? []);
      return (
        stageIndex === undefined ||
        paths.some((path) => stageIndexOf(path) !== stageIndex)
      );
    });
    reportDuplicateProtocolObjectIds(duplicates, ctx);
  },
);
