import { z } from 'zod';

import { IntroductionPanelSchema, TitlelessFormSchema } from '../common';
import { baseStageSchema } from './base';

export const egoFormStage = baseStageSchema.extend({
  type: z.literal('EgoForm'),
  form: TitlelessFormSchema,
  introductionPanel: IntroductionPanelSchema,
});
