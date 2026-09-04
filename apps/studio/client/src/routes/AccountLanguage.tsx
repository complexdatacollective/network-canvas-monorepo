import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl, useAppLocale } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import LocaleSelect from '@codaco/fresco-ui/form/fields/LocaleSelect';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useStudioLocale } from '../i18n/StudioI18nProvider.tsx';

/**
 * `/account/language` (§5.3): the language Studio itself speaks to this
 * researcher.
 *
 * The choice is a preference, not a mode: "Automatic" is a real value meaning
 * "follow this browser", stored as `null`, and it is what a researcher who has
 * never chosen already has. Choosing saves immediately — there is nothing to
 * submit, because a language a researcher can see they have selected but has
 * not been applied is a worse state than either end.
 *
 * The registry comes from the provider rather than from the module: a
 * development build adds the pseudo-locale to it, and this page is where that
 * locale is reachable by eye.
 */

const messages = defineMessages({
  heading: {
    id: 'studio.accountLanguage.heading',
    defaultMessage: 'Language',
    description:
      "Heading of the account screen where the researcher chooses Studio's own language.",
  },
  intro: {
    id: 'studio.accountLanguage.intro',
    defaultMessage:
      'The language Studio speaks to you: its navigation, forms, and messages. This is a separate choice from the languages a protocol offers its participants, which each study sets for itself.',
    description:
      "Explanation under the language screen's heading, distinguishing the interface language from a protocol's participant languages.",
  },
  fieldLabel: {
    id: 'studio.accountLanguage.fieldLabel',
    defaultMessage: 'Studio language',
    description: 'Label of the interface-language selector.',
  },
  automatic: {
    id: 'studio.accountLanguage.automatic',
    defaultMessage: 'Automatic (browser language)',
    description:
      'The language-selector entry meaning "follow the languages this browser asks for" rather than a fixed choice.',
  },
  followsDevice: {
    id: 'studio.accountLanguage.followsDevice',
    defaultMessage:
      'Automatic follows the languages your browser asks for, and can differ from device to device.',
    description:
      'Hint under the language selector explaining what the automatic entry does.',
  },
  saving: {
    id: 'studio.accountLanguage.saving',
    defaultMessage: 'Saving your language choice…',
    description: 'Shown while the language preference is being stored.',
  },
  saved: {
    id: 'studio.accountLanguage.saved',
    defaultMessage: 'Language saved. It will follow you to your other devices.',
    description:
      'Confirmation after the language preference was stored on the account.',
  },
  saveFailed: {
    id: 'studio.accountLanguage.saveFailed',
    defaultMessage:
      'Studio is using this language here, but could not save it to your account. It will not follow you to your other devices until you choose it again.',
    description:
      'Shown when the language was applied locally but storing it on the account failed.',
  },
});

export default function AccountLanguage() {
  const intl = useAppIntl();
  const { locales } = useAppLocale();
  const { preference, saveState, setLocale } = useStudioLocale();

  return (
    <div className="tablet-portrait:p-8 mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      <div>
        <Heading level="h1" margin="none" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.heading)}
        </Heading>
        <Paragraph margin="none">
          {intl.formatMessage(messages.intro)}
        </Paragraph>
      </div>

      <Surface spacing="lg">
        <div className="max-w-md">
          <label className="text-sm font-bold" htmlFor="account-language">
            {intl.formatMessage(messages.fieldLabel)}
          </label>
          <LocaleSelect
            id="account-language"
            name="account-language"
            className="mt-1"
            options={locales}
            value={preference}
            automaticLabel={intl.formatMessage(messages.automatic)}
            // No submit: the choice IS the action, and it takes effect on the
            // spot. `null` is the automatic entry, which is a stored answer of
            // its own rather than the absence of one.
            onChange={setLocale}
          />
          <Paragraph className="mt-2 text-sm opacity-70" margin="none">
            {intl.formatMessage(messages.followsDevice)}
          </Paragraph>
        </div>

        {/*
          One region for all three outcomes, so a screen reader announces the
          result of a choice rather than the arrival and departure of separate
          alerts. `saving` is announced too: the write crosses the network and
          the select has already moved.
        */}
        {saveState !== 'idle' && (
          <Alert
            className="mt-4"
            variant={saveState === 'error' ? 'destructive' : 'default'}
          >
            <span role="status">
              {saveState === 'saving' && intl.formatMessage(messages.saving)}
              {saveState === 'saved' && intl.formatMessage(messages.saved)}
              {saveState === 'error' && intl.formatMessage(messages.saveFailed)}
            </span>
          </Alert>
        )}
      </Surface>
    </div>
  );
}
