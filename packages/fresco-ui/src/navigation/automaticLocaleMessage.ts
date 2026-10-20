import { defineMessages } from '@codaco/app-i18n/messages';

// One wording for "follow the device" across LocaleSwitcher and LocaleSelect,
// so the header switcher and an in-page picker name the entry the same way.
export const { automaticLocaleMessage } = defineMessages({
  automaticLocaleMessage: {
    id: 'frescoUi.localeSwitcher.automaticCurrent',
    defaultMessage: 'Automatic ({language})',
    description:
      'The automatic entry and the switcher button’s accessible name while it is chosen; {language} is the own name of the language the browser resolves to.',
  },
});
