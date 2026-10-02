import { commonCatalogs } from '@codaco/app-i18n/common';
import {
  defineAppLocales,
  mergeCatalogs,
  type CatalogMessages,
} from '@codaco/app-i18n/locales';
import { frescoUiCatalogs } from '@codaco/fresco-ui/locales';

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
} as const satisfies Record<Locale, 'ltr' | 'rtl'>;

export const siteAppLocales = defineAppLocales(
  supportedLocales.map(({ locale, nativeName }) => ({
    locale,
    label: nativeName,
    direction: directions[locale],
  })),
);

export const siteAppCatalogs: Readonly<Record<Locale, CatalogMessages>> = {
  'en-US': {},
  'en-GB': mergeCatalogs(
    commonCatalogs['en-GB'] ?? {},
    frescoUiCatalogs['en-GB'] ?? {},
  ),
  'es': mergeCatalogs(commonCatalogs.es ?? {}, frescoUiCatalogs.es ?? {}),
  'zh-Hans': mergeCatalogs(
    commonCatalogs['zh-Hans'] ?? {},
    frescoUiCatalogs['zh-Hans'] ?? {},
  ),
  'zh-Hant': mergeCatalogs(
    commonCatalogs['zh-Hant'] ?? {},
    frescoUiCatalogs['zh-Hant'] ?? {},
  ),
  'de': mergeCatalogs(commonCatalogs.de ?? {}, frescoUiCatalogs.de ?? {}),
  'nl': mergeCatalogs(commonCatalogs.nl ?? {}, frescoUiCatalogs.nl ?? {}),
  'pt-BR': mergeCatalogs(
    commonCatalogs['pt-BR'] ?? {},
    frescoUiCatalogs['pt-BR'] ?? {},
  ),
};

export function getLocaleDirection(locale: Locale) {
  return directions[locale];
}
