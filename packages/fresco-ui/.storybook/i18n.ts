import { commonCatalogs } from '@codaco/app-i18n/common';
import { ecosystemLocales, mergeCatalogs } from '@codaco/app-i18n/locales';
import { storybookI18n } from '@codaco/storybook-config/i18n';

import { frescoUiCatalogs } from '../src/locales/catalogs';

/**
 * This Storybook's language and direction controls.
 *
 * The registry is `ecosystemLocales` rather than a list of this package's
 * own: `frescoUi.*` catalogs are required to be complete for every locale any
 * app ships, so the Storybook that reviews them should offer exactly that set.
 *
 * Catalogs merge in host order — `common.*` first, then this package's own —
 * which is the same order a real host uses, so a `common.*` string that
 * fresco-ui overrides resolves here the way it will in an app.
 */
export const { globalTypes, initialGlobals, withAppI18n } = storybookI18n({
  locales: ecosystemLocales,
  catalogs: Object.fromEntries(
    ecosystemLocales.map(({ locale }) => [
      locale,
      mergeCatalogs(
        commonCatalogs[locale] ?? {},
        frescoUiCatalogs[locale] ?? {},
      ),
    ]),
  ),
});
