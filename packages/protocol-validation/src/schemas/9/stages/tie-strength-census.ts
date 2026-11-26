import { z } from 'zod';

import { withUniqueObjectIds } from '../../../utils/protocolObjectIds.ts';
import { tieStrengthCensusPromptSchema } from '../common/index.ts';
import { nodeStageSubjectFor } from '../common/subjects.ts';
import { FilterSchema } from '../filters/index.ts';
import { baseStageSchema } from './base.ts';

export const tieStrengthCensusStage = withUniqueObjectIds(
  baseStageSchema.extend({
    type: z.literal('TieStrengthCensus'),
    subject: nodeStageSubjectFor('TieStrengthCensus'),
    filter: FilterSchema.optional(),
    prompts: z.array(tieStrengthCensusPromptSchema).min(1),
  }),
);
