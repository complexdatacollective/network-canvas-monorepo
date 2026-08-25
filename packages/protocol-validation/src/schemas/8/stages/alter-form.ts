import z from 'zod';

import {
  IntroductionPanelSchema,
  NodeStageSubjectSchema,
  TitlelessFormSchema,
} from '../common/index.ts';
import { FilterSchema } from '../filters/index.ts';
import { stageValuesSynthetic } from '../synthetic/index.ts';
import { baseStageSchema } from './base.ts';

export const alterFormStage = baseStageSchema.extend({
  type: z.literal('AlterForm'),
  synthetic: stageValuesSynthetic('AlterForm').prefault({}),
  filter: FilterSchema.optional(),
  subject: NodeStageSubjectSchema,
  form: TitlelessFormSchema,
  introductionPanel: IntroductionPanelSchema,
});
