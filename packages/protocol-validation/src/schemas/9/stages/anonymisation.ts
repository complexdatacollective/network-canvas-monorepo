import { z } from 'zod';

import { localizedString } from '../localized-string.ts';
import { baseStageSchema } from './base.ts';

export const anonymisationStage = baseStageSchema.extend({
  type: z.literal('Anonymisation'),
  explanationText: z.strictObject({
    title: localizedString(z.string().min(1), 'plain'),
    body: localizedString(z.string().min(1), 'markdown'),
  }),
  validation: z
    .strictObject({
      minLength: z.number().int().optional(),
      maxLength: z.number().int().optional(),
    })
    .optional(),
});
