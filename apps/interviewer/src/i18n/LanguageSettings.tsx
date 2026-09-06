import { useId } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import LocaleSelect from '@codaco/fresco-ui/form/fields/LocaleSelect';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useInterviewerLocale } from './InterviewerI18nProvider';
import { interviewerLocales } from './locales';

export const languageMessages = defineMessages({
  label: {
    id: 'interviewer.language.label',
    defaultMessage: 'App language',
    description:
      'Label for the device language selector in Interviewer home, setup, and settings.',
  },
  hint: {
    id: 'interviewer.language.hint',
    defaultMessage:
      'Choose the language for Interviewer and its built-in interview controls on this device. This does not change protocol content or collected data.',
    description:
      'Explains that the device language applies to app-provided controls while protocol-authored content and research data stay unchanged.',
  },
  automatic: {
    id: 'interviewer.language.automatic',
    defaultMessage: 'Automatic (browser)',
    description:
      'Language option that follows this device browser preferences instead of storing an explicit choice.',
  },
  saved: {
    id: 'interviewer.language.saved',
    defaultMessage: 'Language preference saved on this device.',
    description:
      'Status announced after persisting the administration language choice.',
  },
  failed: {
    id: 'interviewer.language.failed',
    defaultMessage:
      'The language changed for this session, but the preference could not be saved. Your browser may be blocking device storage.',
    description:
      'Error announced when the language applies immediately but cannot persist across reloads.',
  },
});

export function LanguageSettings({ compact = false }: { compact?: boolean }) {
  const intl = useAppIntl();
  const { preference, setPreference, saveState } = useInterviewerLocale();
  const id = useId();
  return (
    <div className={`flex min-w-0 flex-col gap-3 ${compact ? '' : 'py-4'}`}>
      <label htmlFor={id} className="font-heading font-bold">
        {intl.formatMessage(languageMessages.label)}
      </label>
      {!compact && (
        <Paragraph id={`${id}-hint`} margin="none" emphasis="muted">
          {intl.formatMessage(languageMessages.hint)}
        </Paragraph>
      )}
      <LocaleSelect
        id={id}
        aria-describedby={compact ? undefined : `${id}-hint`}
        options={interviewerLocales}
        value={preference}
        onChange={setPreference}
        automaticLabel={intl.formatMessage(languageMessages.automatic)}
        className="max-w-full"
      />
      <Paragraph
        role="status"
        aria-live="polite"
        margin="none"
        className={compact && saveState !== 'failed' ? 'sr-only' : 'min-h-lh'}
      >
        {saveState === 'saved'
          ? intl.formatMessage(languageMessages.saved)
          : saveState === 'failed'
            ? intl.formatMessage(languageMessages.failed)
            : null}
      </Paragraph>
    </div>
  );
}
