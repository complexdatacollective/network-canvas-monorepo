import { z } from 'zod';

import {
  EdgeStageSubjectSchema,
  IntroductionPanelSchema,
  TitlelessFormSchema,
} from '../common';
import { FilterSchema } from '../filters';
import { baseStageSchema } from './base';

export const alterEdgeFormStage = baseStageSchema.extend({
  type: z.literal('AlterEdgeForm'),
  subject: EdgeStageSubjectSchema,
  filter: FilterSchema.optional(),
  form: TitlelessFormSchema,
  introductionPanel: IntroductionPanelSchema,
});
