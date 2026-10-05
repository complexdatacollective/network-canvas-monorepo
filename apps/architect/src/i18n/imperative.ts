import { createAppIntl, type IntlShape } from '@codaco/app-i18n/messages';

import { architectCatalogs } from '../locales/catalogs';
import { readLocalePreference, resolveDeviceLocale } from './preference';

const initialLocale = resolveDeviceLocale(readLocalePreference());
let currentIntl = createAppIntl({
  locale: initialLocale,
  messages: architectCatalogs[initialLocale],
});

/** Architect has one researcher chrome root per browser realm. This bridge is
 * only for Redux thunks and startup restoration outside React. Rendered copy
 * subscribes through useAppIntl/AppMessage instead of reading this bridge. */
export const getArchitectIntl = (): IntlShape => currentIntl;
export const installArchitectIntl = (intl: IntlShape): void => {
  currentIntl = intl;
};
