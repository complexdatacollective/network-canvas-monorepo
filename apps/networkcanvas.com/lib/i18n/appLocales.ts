import { commonCatalogLoaders } from '@codaco/app-i18n/common';
import {
  createCatalogSource,
  defineAppLocales,
} from '@codaco/app-i18n/locales';
import { frescoUiCatalogLoaders } from '@codaco/fresco-ui/locales';

import { supportedLocales, type Locale } from './locales';

const directions = {
  'en-US': 'ltr',
  'en-GB': 'ltr',
  'es': 'ltr',
  'zh-Hans': 'ltr',
  'zh-Hant': 'ltr',
  'de': 'ltr',
  'nl': 'ltr',
  'pt-BR': 'ltr',
  'it': 'ltr',
  'fr': 'ltr',
} as const satisfies Record<Locale, 'ltr' | 'rtl'>;

export const siteAppLocales = defineAppLocales(
  supportedLocales.map(({ locale, nativeName }) => ({
    locale,
    label: nativeName,
    direction: directions[locale],
  })),
);

/**
 * The shared-package messages the site renders (common, then fresco-ui), one
 * locale at a time. Only the server loads from it: the locale layout hands its
 * locale's catalog to the client provider as props. The locale switcher's
 * import of this module puts the loaders in the client graph too, but only as
 * async chunks nothing there requests. `en-US`, which no package translates,
 * resolves to an empty catalog.
 */
export const siteAppCatalogSource = createCatalogSource(
  commonCatalogLoaders,
  frescoUiCatalogLoaders,
);

export function getLocaleDirection(locale: Locale) {
  return directions[locale];
}
