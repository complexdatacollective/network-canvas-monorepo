import { commonCatalogLoaders } from '@codaco/app-i18n/common';
import {
  type CatalogMessages,
  ecosystemLocales,
  loadCatalog,
} from '@codaco/app-i18n/locales';
import { storybookI18n } from '@codaco/storybook-config/i18n';

import { frescoUiCatalogLoaders } from '../src/locales/catalogs';

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
 *
 * Every locale is loaded up front. A real host loads one language at a time,
 * but the toolbar can switch to any of them mid-session and `storybookI18n`
 * reads its catalogs synchronously, so a Storybook — a development tool with
 * nothing to save on download size — awaits them all before it renders.
 */
export const { globalTypes, initialGlobals, withAppI18n } = storybookI18n({
  locales: ecosystemLocales,
  catalogs: Object.fromEntries(
    await Promise.all(
      ecosystemLocales.map(
        async ({ locale }): Promise<[string, CatalogMessages]> => [
          locale,
          await loadCatalog(
            locale,
            commonCatalogLoaders,
            frescoUiCatalogLoaders,
          ),
        ],
      ),
    ),
  ),
});
