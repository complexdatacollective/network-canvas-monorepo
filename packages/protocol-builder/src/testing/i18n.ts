import { createAppIntl } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';

import { protocolBuilderCatalogs } from '../locales/catalogs.ts';

/**
 * A Spanish formatter for tests.
 *
 * The suite mounts no `AppI18nProvider`, so components render their English
 * `defaultMessage`s and the existing English assertions stand unchanged. This
 * is for the case where a module that PRODUCES copy — `describeRule` — has to
 * be handed the same formatter the component beside it renders through, so a
 * translated preview beside an English verdict fails the test.
 */
export const esIntl: IntlShape = createAppIntl({
  locale: 'es',
  messages: protocolBuilderCatalogs.es,
});
