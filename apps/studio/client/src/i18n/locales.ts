import {
  defineAppLocales,
  ecosystemLocales,
  pseudoAppLocale,
} from '@codaco/app-i18n/locales';
import type { AppLocale } from '@codaco/app-i18n/locales';

/**
 * The locales Studio ships a UI in (2026-09-04 localization design §5.1).
 *
 * Today Studio's registry is exactly the ecosystem set — `en` and `en-GB` —
 * and the guard test pins it to `SUPPORTED_STUDIO_LOCALES` from
 * `@codaco/studio-rpc`, the list the server validates a stored preference
 * against. The three lists move together in the PR that adds a locale.
 */
export const studioProductionLocales = defineAppLocales(ecosystemLocales);

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
