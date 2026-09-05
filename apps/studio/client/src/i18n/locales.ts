import {
  defineAppLocales,
  ecosystemLocales,
  pseudoAppLocale,
} from '@codaco/app-i18n/locales';
import type { AppLocale } from '@codaco/app-i18n/locales';
import { SUPPORTED_STUDIO_LOCALES } from '@codaco/studio-rpc';

/**
 * The locales Studio ships a UI in (2026-09-04 localization design §5.1).
 *
 * The RPC contract controls Studio's supported subset. The ecosystem can
 * grow when another app adds a translation without Studio advertising copy
 * it has not translated or a preference its server will refuse to store.
 * Locale metadata still comes from the shared registry.
 */
export const studioProductionLocales = defineAppLocales(
  SUPPORTED_STUDIO_LOCALES.map((locale) => {
    const metadata = ecosystemLocales.find((entry) => entry.locale === locale);
    if (metadata === undefined) {
      throw new Error(
        `Studio locale ${locale} is absent from ecosystemLocales`,
      );
    }
    return { ...metadata, locale };
  }),
);

/**
 * The registry the app mounts. Development builds append the accented,
 * expanded pseudo-locale (`en-XA`) so hardcoded-string leaks and clipped
 * layouts are visible by eye; it never enters a production registry and is
 * never sent to the server as a preference.
 */
export const studioLocales: readonly AppLocale[] = import.meta.env.DEV
  ? [...studioProductionLocales, pseudoAppLocale]
  : studioProductionLocales;

export const studioDefaultLocale = 'en';
