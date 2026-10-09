import z from 'zod';

import { localizedString, nonBlankText } from '../localized-string.ts';

/**
 * The screen a form or census stage opens with. The body text is optional: a
 * panel with only a title is a complete introduction. When a body is given,
 * every translation of it must say something, as the title's must.
 */
export const IntroductionPanelSchema = z.strictObject({
  title: localizedString(nonBlankText(), 'plain'),
  text: localizedString(nonBlankText(), 'markdown').optional(),
});
