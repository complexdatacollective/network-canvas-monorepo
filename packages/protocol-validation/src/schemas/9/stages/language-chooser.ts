import { z } from 'zod';

import { baseStageSchema } from './base.ts';

export const languageChooserStage = baseStageSchema.extend({
  type: z.literal('LanguageChooser'),
});
