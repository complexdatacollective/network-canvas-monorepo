import type { CatalogMessages } from '@codaco/app-i18n/locales';
import { storybookI18n } from '@codaco/storybook-config/i18n';

import { frescoLocales } from '../i18n/locales';
import { frescoCatalogSource } from '../src/locales/catalogs';

/**
 * This Storybook's language and direction controls: the ones every Storybook
 * in the repo shares (`@codaco/storybook-config`), over Fresco's own languages
 * and the catalogs the app merges for each.
 *
 * The stories mount the app's own `Providers`, which give Base UI the
 * direction of the app's language. With no language around them that is
 * always left to right, so this decorator is also what lets a story be read
 * right to left at all.
 *
 * Every language is loaded up front. The app loads one at a time, but the
 * toolbar can switch to any of them mid-session and `storybookI18n` reads its
 * catalogs synchronously.
 */
export const { globalTypes, initialGlobals, withAppI18n, mirrorAddon } =
  storybookI18n({
    locales: frescoLocales,
    catalogs: Object.fromEntries(
      await Promise.all(
        frescoLocales.map(
          async ({ locale }): Promise<[string, CatalogMessages]> => [
            locale,
            await frescoCatalogSource.load(locale),
          ],
        ),
      ),
    ),
  });
