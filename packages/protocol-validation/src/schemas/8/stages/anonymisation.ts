import { z } from 'zod';

import { baseStageSchema } from './base.ts';

export const anonymisationStage = baseStageSchema.extend({
  type: z.literal('Anonymisation'),
  explanationText: z.strictObject({
    title: z.string(),
    body: z.string(),
  }),
  validation: z
    .strictObject({
      minLength: z.number().int().optional(),
      maxLength: z.number().int().optional(),
    })
    .optional(),
});
