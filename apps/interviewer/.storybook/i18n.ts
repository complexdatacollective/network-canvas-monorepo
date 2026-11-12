import type { CatalogMessages } from '@codaco/app-i18n/locales';
import { storybookI18n } from '@codaco/storybook-config/i18n';

import { interviewerProductionLocales } from '../src/i18n/locales';
import { interviewerCatalogSource } from '../src/locales/catalogs';

/**
 * This Storybook's language and direction controls: the ones every Storybook
 * in the repo shares (`@codaco/storybook-config`), over Interviewer's own
 * languages and the catalogs the app merges for each.
 *
 * Every language is loaded up front. The app loads one at a time, but the
 * toolbar can switch to any of them mid-session and `storybookI18n` reads its
 * catalogs synchronously.
 */
export const { globalTypes, initialGlobals, withAppI18n, mirrorAddon } =
  storybookI18n({
    locales: interviewerProductionLocales,
    catalogs: Object.fromEntries(
      await Promise.all(
        interviewerProductionLocales.map(
          async ({ locale }): Promise<[string, CatalogMessages]> => [
            locale,
            await interviewerCatalogSource.load(locale),
          ],
        ),
      ),
    ),
  });
