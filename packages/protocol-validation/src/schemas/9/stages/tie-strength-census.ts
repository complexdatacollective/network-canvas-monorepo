import { z } from 'zod';

import { withUniqueObjectIds } from '../../../utils/protocolObjectIds.ts';
import {
  NodeStageSubjectSchema,
  tieStrengthCensusPromptSchema,
} from '../common/index.ts';
import { FilterSchema } from '../filters/index.ts';
import { baseStageSchema } from './base.ts';

export const tieStrengthCensusStage = withUniqueObjectIds(
  baseStageSchema.extend({
    type: z.literal('TieStrengthCensus'),
    subject: NodeStageSubjectSchema,
    filter: FilterSchema.optional(),
    prompts: z.array(tieStrengthCensusPromptSchema).min(1),
  }),
);
