import { z } from 'zod';

import { withUniqueObjectIds } from '../../../utils/protocolObjectIds.ts';
import { binBehavioursSchema } from '../common/behaviours.ts';
import {
  nodeStageSubjectFor,
  ordinalBinPromptSchema,
} from '../common/index.ts';
import { FilterSchema } from '../filters/index.ts';
import { baseStageSchema } from './base.ts';
import { binWording } from './bin-wording.ts';

export const ordinalBinStage = withUniqueObjectIds(
  baseStageSchema.extend({
    type: z.literal('OrdinalBin'),
    subject: nodeStageSubjectFor('OrdinalBin'),
    filter: FilterSchema.optional(),
    behaviours: binBehavioursSchema,
    prompts: z.array(ordinalBinPromptSchema).min(1),
    ...binWording,
  }),
);
