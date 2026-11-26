import { z } from 'zod';

import { withUniqueObjectIds } from '../../../utils/protocolObjectIds.ts';
import { binBehavioursSchema } from '../common/behaviours.ts';
import { categoricalBinPromptSchema } from '../common/index.ts';
import { nodeStageSubjectFor } from '../common/subjects.ts';
import { FilterSchema } from '../filters/index.ts';
import { baseStageSchema } from './base.ts';
import { binWording } from './bin-wording.ts';

export const CATEGORICAL_BIN_MAX_BINS = 10;

export const categoricalBinStage = withUniqueObjectIds(
  baseStageSchema.extend({
    type: z.literal('CategoricalBin'),
    subject: nodeStageSubjectFor('CategoricalBin'),
    filter: FilterSchema.optional(),
    behaviours: binBehavioursSchema,
    prompts: z.array(categoricalBinPromptSchema).min(1),
    ...binWording,
  }),
);
