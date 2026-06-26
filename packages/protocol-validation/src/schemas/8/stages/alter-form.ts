import z from 'zod';

import {
  IntroductionPanelSchema,
  NodeStageSubjectSchema,
  TitlelessFormSchema,
} from '../common';
import { FilterSchema } from '../filters';
import { baseStageSchema } from './base';

export const alterFormStage = baseStageSchema.extend({
  type: z.literal('AlterForm'),
  filter: FilterSchema.optional(),
  subject: NodeStageSubjectSchema,
  form: TitlelessFormSchema,
  introductionPanel: IntroductionPanelSchema,
});
