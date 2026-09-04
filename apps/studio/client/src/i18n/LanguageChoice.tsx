import { useId } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl, useAppLocale } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import LocaleSelect from '@codaco/fresco-ui/form/fields/LocaleSelect';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useStudioLocale } from './StudioI18nProvider.tsx';

/**
 * The control itself: the selector, what "Automatic" means, and what became of
 * the choice. Separate from `/account/language` because the account screen is
 * not the only place a researcher needs it.
 *
 * `/no-team` is the other. A session with no team memberships is redirected
 * there from every app route (§6.4), the account area included, so a
 * researcher waiting on an invitation cannot open the language screen at all —
 * and their preference is per-account, with nothing to do with teams. Without
 * this the language Studio speaks to them would be the one thing about their
 * own account they could not change, on a screen they may spend their whole
 * visit on. Sign-out is on that screen for the same reason.
 *
 * The registry comes from the provider rather than from the module: a
 * development build adds the pseudo-locale to it, and these are the two places
 * that locale is reachable by eye.
 */

const messages = defineMessages({
  fieldLabel: {
    id: 'studio.languageChoice.fieldLabel',
    defaultMessage: 'Studio language',
    description: 'Label of the interface-language selector.',
  },
  automatic: {
    id: 'studio.languageChoice.automatic',
    defaultMessage: 'Automatic (browser language)',
    description:
      'The language-selector entry meaning "follow the languages this browser asks for" rather than a fixed choice.',
  },
  followsDevice: {
    id: 'studio.languageChoice.followsDevice',
    defaultMessage:
      'Automatic follows the languages your browser asks for, and can differ from device to device.',
    description:
      'Hint under the language selector explaining what the automatic entry does.',
  },
  saving: {
    id: 'studio.languageChoice.saving',
    defaultMessage: 'Saving your language choice…',
    description: 'Shown while the language preference is being stored.',
  },
  saved: {
    id: 'studio.languageChoice.saved',
    defaultMessage: 'Language saved. It will follow you to your other devices.',
    description:
      'Confirmation after the language preference was stored on the account.',
  },
  saveFailed: {
    id: 'studio.languageChoice.saveFailed',
    defaultMessage:
      'Studio is using this language here, but could not save it to your account. It will not follow you to your other devices until you choose it again.',
    description:
      'Shown when the language was applied locally but storing it on the account failed.',
  },
});

export default function LanguageChoice() {
  const intl = useAppIntl();
  const { locales } = useAppLocale();
  const { preference, saveState, setLocale } = useStudioLocale();
  const fieldId = useId();

  return (
    <>
      <div className="max-w-md">
        <label className="text-sm font-bold" htmlFor={fieldId}>
          {intl.formatMessage(messages.fieldLabel)}
        </label>
        <LocaleSelect
          id={fieldId}
          name="studio-language"
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
    </>
  );
}
