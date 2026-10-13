import { z } from 'zod';

import { localizedString, nonBlankText } from '../localized-string.ts';
import { baseStageSchema } from './base.ts';

export const anonymisationStage = baseStageSchema.extend({
  type: z.literal('Anonymisation'),
  explanationText: z.strictObject({
    title: localizedString(nonBlankText(), 'plain', {
      dynamicValues: 'stageText',
    }),
    body: localizedString(nonBlankText(), 'markdown', {
      dynamicValues: 'stageText',
    }),
  }),
  validation: z
    .strictObject({
      minLength: z.number().int().optional(),
      maxLength: z.number().int().optional(),
    })
    .optional(),
});
