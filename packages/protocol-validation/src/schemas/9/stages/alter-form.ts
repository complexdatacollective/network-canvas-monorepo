import { z } from 'zod';

import { withUniqueObjectIds } from '../../../utils/protocolObjectIds.ts';
import { TitlelessFormSchema } from '../common/index.ts';
import { nodeStageSubjectFor } from '../common/subjects.ts';
import { FilterSchema } from '../filters/index.ts';
import { baseStageSchema } from './base.ts';

export const alterFormStage = withUniqueObjectIds(
  baseStageSchema.extend({
    type: z.literal('AlterForm'),
    filter: FilterSchema.optional(),
    subject: nodeStageSubjectFor('AlterForm'),
    form: TitlelessFormSchema,
  }),
);
