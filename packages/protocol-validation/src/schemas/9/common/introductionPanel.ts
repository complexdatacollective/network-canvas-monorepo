import z from 'zod';

import { localizedString, nonBlankText } from '../localized-string.ts';

export const IntroductionPanelSchema = z.strictObject({
  title: localizedString(nonBlankText(), 'plain'),
  text: localizedString(z.string().min(1), 'markdown'),
});
