import { commonCatalogs } from '@codaco/app-i18n/common';
import { ecosystemLocales, mergeCatalogs } from '@codaco/app-i18n/locales';
import { frescoUiCatalogs } from '@codaco/fresco-ui/locales';
import { storybookI18n } from '@codaco/storybook-config/i18n';

import { protocolBuilderCatalogs } from '../src/locales/catalogs.ts';

/**
 * This Storybook's language and direction controls.
 *
 * Every stage editor in this package reads its copy through `useAppIntl()`,
 * which renders each descriptor's English `defaultMessage` when no provider is
 * mounted. That fallback is what let the stories run with no i18n wiring at
 * all — and it is also why a string somebody forgot to convert looks exactly
 * like a string that is converted and untranslated. Switching the toolbar to
 * Español is the difference: what stays English is what has no descriptor.
 *
 * The implementation is `@codaco/storybook-config`, the same controls
 * `@codaco/fresco-ui`'s Storybook mounts, rather than a second one here. The
 * globals (`appLocale`, `appDirection`), their storage keys and their
 * stand-down under automation are therefore shared, so a reviewer moving
 * between the two Storybooks operates one control, and the direction axis
 * — which no locale here exercises yet — arrives for free.
 *
 * Catalogs merge in host order — `common.*`, then `frescoUi.*`, then this
 * package's own — which is the order Architect and Studio use, so a shared
 * verb this package renders through a fresco-ui control resolves here the way
 * it will in the app. `en` has no catalog in any of the three (it is the
 * source locale), so it merges to `{}` and every descriptor renders its
 * `defaultMessage`: the toolbar's default is byte-for-byte what the stories
 * rendered before this file existed, which is what keeps the existing plays
 * and the Chromatic captures unchanged.
 */
export const { globalTypes, initialGlobals, withAppI18n } = storybookI18n({
  locales: ecosystemLocales,
  catalogs: Object.fromEntries(
    ecosystemLocales.map(({ locale }) => [
      locale,
      mergeCatalogs(
        commonCatalogs[locale] ?? {},
        frescoUiCatalogs[locale] ?? {},
        protocolBuilderCatalogs[locale] ?? {},
      ),
    ]),
  ),
});
