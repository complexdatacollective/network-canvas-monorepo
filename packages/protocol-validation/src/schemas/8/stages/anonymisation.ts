import { z } from 'zod';

import { stageNoDataSynthetic } from '../synthetic/index.ts';
import { baseStageSchema } from './base.ts';

export const anonymisationStage = baseStageSchema.extend({
  type: z.literal('Anonymisation'),
  // Writes nothing to the network: the passphrase a participant sets here is
  // UI state that unlocks the session, never an attribute on any entity. The
  // stage still costs the participant time, so it keeps its response burden
  // and only declines to generate data.
  synthetic: stageNoDataSynthetic('Anonymisation').prefault({
    generatesData: false,
  }),
  explanationText: z.strictObject({
    title: z.string().min(1),
    body: z.string().min(1),
  }),
  validation: z
    .strictObject({
      minLength: z.number().int().optional(),
      maxLength: z.number().int().optional(),
    })
    .optional(),
});
