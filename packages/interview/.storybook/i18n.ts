import { defineAppLocales } from '@codaco/app-i18n/locales';
import { storybookI18n } from '@codaco/storybook-config/i18n';

/**
 * This Storybook's language and direction controls: the ones every Storybook
 * in the repo shares (`@codaco/storybook-config`).
 *
 * English is the only language offered, beside the pseudo-locale, because it
 * is the only one this package has. An interview's words come from its
 * protocol, in the language negotiated from the protocol's own, and what the
 * package keeps built in is English (see `InterviewI18nProvider`). Offering
 * Spanish here would translate the fresco-ui controls inside a story and
 * nothing else in it.
 *
 * Direction is the control this Storybook is given them for. It mirrors every
 * story that renders a component by itself. A story that mounts `Shell` is the
 * exception, as it is in a host: `Shell` takes its direction from the
 * interview's language, so it is read right to left by giving its protocol a
 * right-to-left language.
 */
export const { globalTypes, initialGlobals, withAppI18n } = storybookI18n({
  locales: defineAppLocales([
    { locale: 'en', label: 'English', direction: 'ltr' },
  ]),
  catalogs: {},
});
