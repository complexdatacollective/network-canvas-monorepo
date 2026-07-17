import { z } from 'zod';

import {
  IntroductionPanelSchema,
  TitlelessFormSchema,
} from '../common/index.ts';
import { baseStageSchema } from './base.ts';

export const egoFormStage = baseStageSchema.extend({
  type: z.literal('EgoForm'),
  form: TitlelessFormSchema,
  introductionPanel: IntroductionPanelSchema,
});
