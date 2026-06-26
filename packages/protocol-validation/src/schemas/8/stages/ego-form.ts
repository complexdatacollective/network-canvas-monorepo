import { getEgoVariableId } from '~/utils/mock-seeds';
import { z } from '~/utils/zod-mock-extension';

import { IntroductionPanelSchema, TitlelessFormSchema } from '../common';
import { asEntityAttributeReference } from '../entity-attribute-reference';
import { baseStageSchema } from './base';

export const egoFormStage = baseStageSchema
  .extend({
    type: z.literal('EgoForm'),
    form: TitlelessFormSchema,
    introductionPanel: IntroductionPanelSchema,
  })
  .generateMock((base) => ({
    ...base,
    form: {
      fields: [
        {
          variable: asEntityAttributeReference(getEgoVariableId(0)),
          prompt: 'What is your first name?',
        },
        {
          variable: asEntityAttributeReference(getEgoVariableId(1)),
          prompt: 'What is your age?',
        },
        {
          variable: asEntityAttributeReference(getEgoVariableId(2)),
          prompt: 'What is your date of birth?',
        },
      ],
    },
  }));
