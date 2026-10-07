import z from 'zod';

import { localizedString } from '../localized-string.ts';

export const IntroductionPanelSchema = z.strictObject({
  title: localizedString(z.string().min(1), 'plain'),
  text: localizedString(z.string().min(1), 'markdown'),
});
