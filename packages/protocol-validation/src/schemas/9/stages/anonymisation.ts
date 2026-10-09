import { z } from 'zod';

import { localizedString, nonBlankText } from '../localized-string.ts';
import { baseStageSchema } from './base.ts';

export const anonymisationStage = baseStageSchema.extend({
  type: z.literal('Anonymisation'),
  explanationText: z.strictObject({
    title: localizedString(nonBlankText(), 'plain'),
    body: localizedString(nonBlankText(), 'markdown'),
  }),
  validation: z
    .strictObject({
      minLength: z.number().int().optional(),
      maxLength: z.number().int().optional(),
    })
    .optional(),
});
