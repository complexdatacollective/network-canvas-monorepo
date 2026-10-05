import { z } from 'zod';

import { localizedString } from '../localized-string.ts';
import { baseStageSchema } from './base.ts';

export const languageChooserStage = baseStageSchema.extend({
  type: z.literal('LanguageChooser'),
  introduction: localizedString(z.string().min(1), 'markdown').optional(),
});
