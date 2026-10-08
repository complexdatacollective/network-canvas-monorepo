import { createAppIntl, type IntlShape } from '@codaco/app-i18n/messages';

import { architectCatalogSource } from '../locales/catalogs';
import { architectDefaultLocale } from './locales';
import { readLocalePreference, resolveDeviceLocale } from './preference';

const startupLocale = resolveDeviceLocale(readLocalePreference());

let currentIntl: IntlShape | undefined;
let sourceLanguageIntl: IntlShape | undefined;

/**
 * Loads the language Architect starts in. A host awaits it before anything
 * formats through `getArchitectIntl` and before React's first render, which
 * then has the catalog it needs without suspending.
 */
export const loadStartupLocale = () =>
  architectCatalogSource.load(startupLocale);

/** Architect has one researcher chrome root per browser realm. This bridge is
 * only for Redux thunks and startup restoration outside React. Rendered copy
 * subscribes through useAppIntl/AppMessage instead of reading this bridge.
 *
 * Before React installs its formatter this formats in the startup language,
 * once `loadStartupLocale` has loaded it. Until then — or for good, if that
 * load failed — it formats in English, the language the boot screen ships in,
 * rather than the startup locale's number and date conventions around English
 * words. */
export const getArchitectIntl = (): IntlShape => {
  if (currentIntl !== undefined) return currentIntl;
  const messages = architectCatalogSource.peek(startupLocale);
  if (messages === undefined) {
    sourceLanguageIntl ??= createAppIntl({ locale: architectDefaultLocale });
    return sourceLanguageIntl;
  }
  currentIntl = createAppIntl({ locale: startupLocale, messages });
  return currentIntl;
};
export const installArchitectIntl = (intl: IntlShape): void => {
  currentIntl = intl;
};
