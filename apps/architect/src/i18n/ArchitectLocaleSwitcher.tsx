import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import LocaleSwitcher from '@codaco/fresco-ui/navigation/LocaleSwitcher';

import { useArchitectLocale } from './ArchitectI18nProvider';
import { architectLocales } from './locales';

const messages = defineMessages({
  description: {
    id: 'architect.language.description',
    defaultMessage:
      'Interface and preview controls only, on this device. Protocol content is unaffected.',
    description:
      'Note under the interface-language list: the choice applies to Architect and its preview controls on this device, never to authored protocol content.',
  },
});

export default function ArchitectLocaleSwitcher() {
  const intl = useAppIntl();
  const controller = useArchitectLocale();
  if (controller === null) return null;
  const { preference, automaticLocale, saveState, setLocale } = controller;
  return (
    <LocaleSwitcher
      options={architectLocales}
      value={preference}
      automaticLocale={automaticLocale}
      onChange={setLocale}
      saveState={saveState}
      persistence="device"
      description={intl.formatMessage(messages.description)}
    />
  );
}
