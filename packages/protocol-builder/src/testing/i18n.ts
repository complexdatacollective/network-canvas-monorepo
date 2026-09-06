import { createAppIntl } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';

import { protocolBuilderCatalogs } from '../locales/catalogs.ts';

/**
 * Formatters for tests, in the two languages the package ships copy for.
 *
 * The suite mounts no `AppI18nProvider`, so components render their English
 * `defaultMessage`s and the existing English assertions stand unchanged. These
 * are for the two cases where a hand-written literal would not be an honest
 * oracle: a module that PRODUCES copy — `describeRule` — has to be handed the
 * same formatter the component beside it renders through, so a translated
 * preview beside an English verdict fails; and a value that is a message
 * DESCRIPTOR rather than a phrase has to be formatted before an assertion can
 * name the words a researcher reads.
 */
export const enIntl: IntlShape = createAppIntl({ locale: 'en' });

export const esIntl: IntlShape = createAppIntl({
  locale: 'es',
  messages: protocolBuilderCatalogs.es,
});
