import { z } from 'zod';

import { localizedString, nonBlankText } from '../localized-string.ts';
import { baseStageSchema } from './base.ts';

export const languageChooserStage = baseStageSchema.extend({
  type: z.literal('LanguageChooser'),
  // The heading over the languages, which Network Canvas supplies
  // (`stage-wording/language-chooser.ts`). The participant reads it in the
  // language the interview is shown in, which changes as they choose. A stage
  // that omits it shows Network Canvas's wording.
  title: localizedString(nonBlankText(), {
    format: 'plain',
    lines: 'single',
  }).optional(),
});
