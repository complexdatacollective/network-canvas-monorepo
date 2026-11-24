import { z } from 'zod';

import { withUniqueObjectIds } from '../../../utils/protocolObjectIds.ts';
import {
  EdgeStageSubjectSchema,
  TitlelessFormSchema,
} from '../common/index.ts';
import { FilterSchema } from '../filters/index.ts';
import { baseStageSchema } from './base.ts';

export const alterEdgeFormStage = withUniqueObjectIds(
  baseStageSchema.extend({
    type: z.literal('AlterEdgeForm'),
    subject: EdgeStageSubjectSchema,
    filter: FilterSchema.optional(),
    form: TitlelessFormSchema,
  }),
);
