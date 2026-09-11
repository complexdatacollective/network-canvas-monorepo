import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl, useAppLocale } from '@codaco/app-i18n/react';
import LocaleSwitcher from '@codaco/fresco-ui/navigation/LocaleSwitcher';

import { useStudioLocale } from './StudioI18nProvider.tsx';

/**
 * The language Studio speaks to this researcher, reachable from the app header
 * on every screen and from `/no-team`, the one screen a teamless session is
 * held on (§6.4) — their preference is per-account and has nothing to do with
 * teams.
 *
 * The registry comes from the provider rather than from the module: a
 * development build adds the pseudo-locale to it, and this is where that
 * locale is reachable by eye.
 */

const messages = defineMessages({
  description: {
    id: 'studio.localeSwitcher.description',
    defaultMessage:
      'Interface only. Your choice follows your account to your other devices; protocol content and collected data are unaffected.',
    description:
      'Note under the interface-language list: the choice is stored on the account and never touches protocol content or research data.',
  },
});

export default function StudioLocaleSwitcher() {
  const intl = useAppIntl();
  const { locales } = useAppLocale();
  const { preference, automaticLocale, setLocale } = useStudioLocale();

  return (
    <LocaleSwitcher
      options={locales}
      value={preference}
      automaticLocale={automaticLocale}
      // No submit: the choice IS the action, and it takes effect on the spot.
      // `null` is the automatic entry, a stored answer of its own.
      onChange={setLocale}
      description={intl.formatMessage(messages.description)}
    />
  );
}
