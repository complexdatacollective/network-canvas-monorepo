import { z } from 'zod';

import { withUniqueObjectIds } from '../../../utils/protocolObjectIds.ts';
import {
  dyadCensusPromptSchema,
  nodeStageSubjectFor,
} from '../common/index.ts';
import { FilterSchema } from '../filters/index.ts';
import { baseStageSchema } from './base.ts';

export const dyadCensusStage = withUniqueObjectIds(
  baseStageSchema.extend({
    type: z.literal('DyadCensus'),
    subject: nodeStageSubjectFor('DyadCensus'),
    filter: FilterSchema.optional(),
    prompts: z.array(dyadCensusPromptSchema).min(1),
  }),
);
