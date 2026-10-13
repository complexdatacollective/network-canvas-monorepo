import { z } from 'zod';

import {
  EdgeStageSubjectSchema,
  TitlelessFormSchema,
} from '../common/index.ts';
import { FilterSchema } from '../filters/index.ts';
import { baseStageSchema } from './base.ts';

export const alterEdgeFormStage = baseStageSchema.extend({
  type: z.literal('AlterEdgeForm'),
  subject: EdgeStageSubjectSchema,
  filter: FilterSchema.optional(),
  form: TitlelessFormSchema,
});
