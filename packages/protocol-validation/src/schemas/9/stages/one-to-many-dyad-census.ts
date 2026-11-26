import { z } from 'zod';

import { withUniqueObjectIds } from '../../../utils/protocolObjectIds.ts';
import {
  nodeStageSubjectFor,
  oneToManyDyadCensusPromptSchema,
} from '../common/index.ts';
import { FilterSchema } from '../filters/index.ts';
import { baseStageSchema } from './base.ts';

export const oneToManyDyadCensusStage = withUniqueObjectIds(
  baseStageSchema.extend({
    type: z.literal('OneToManyDyadCensus'),
    filter: FilterSchema.optional(),
    subject: nodeStageSubjectFor('OneToManyDyadCensus'),
    behaviours: z.strictObject({
      removeAfterConsideration: z.boolean(),
    }),
    prompts: z.array(oneToManyDyadCensusPromptSchema).min(1),
  }),
);
