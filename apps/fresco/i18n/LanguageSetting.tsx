'use client';

import { useId } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import LocaleSelect from '@codaco/fresco-ui/form/fields/LocaleSelect';
import { useFrescoLocale } from '~/i18n/FrescoI18nProvider';
import { frescoLocales } from '~/i18n/locales';

const messages = defineMessages({
  label: {
    id: 'fresco.language.label',
    defaultMessage: 'Language',
    description: 'Researcher application language preference label.',
  },
  description: {
    id: 'fresco.language.description',
    defaultMessage:
      'Choose the language for Fresco. This does not change interview languages or research data.',
    description: 'Explains the scope of the application language preference.',
  },
  automatic: {
    id: 'fresco.language.automatic',
    defaultMessage: 'Automatic (browser language)',
    description: 'Language choice which follows browser language preferences.',
  },
  saving: {
    id: 'fresco.language.saving',
    defaultMessage: 'Saving language preference…',
    description:
      'Status while saving the language preference to the current account or device.',
  },
  failed: {
    id: 'fresco.language.failed',
    defaultMessage:
      'The language preference could not be saved. Please try again.',
    description:
      'Error announced after a preference write fails and the previous language is restored.',
  },
});

export default function LanguageSetting({
  compact = false,
}: {
  compact?: boolean;
}) {
  const intl = useAppIntl();
  const { preference, saving, failed, setLocale } = useFrescoLocale();
  const id = useId();
  return (
    <div className="flex max-w-xl flex-col gap-2">
      <label htmlFor={id} className="font-semibold">
        {intl.formatMessage(messages.label)}
      </label>
      {!compact && (
        <p id={`${id}-description`}>
          {intl.formatMessage(messages.description)}
        </p>
      )}
      <LocaleSelect
        id={id}
        options={frescoLocales}
        value={preference}
        onChange={setLocale}
        automaticLabel={intl.formatMessage(messages.automatic)}
        aria-describedby={compact ? undefined : `${id}-description`}
      />
      <p role="status" aria-live="polite" className="text-sm">
        {failed
          ? intl.formatMessage(messages.failed)
          : saving
            ? intl.formatMessage(messages.saving)
            : null}
      </p>
    </div>
  );
}
