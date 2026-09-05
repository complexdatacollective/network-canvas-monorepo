import { useId } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import LocaleSelect from '@codaco/fresco-ui/form/fields/LocaleSelect';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useInterviewerLocale } from './InterviewerI18nProvider';
import { interviewerLocales } from './locales';

const messages = defineMessages({
  label: {
    id: 'interviewer.language.label',
    defaultMessage: 'App language',
    description:
      'Label for the administration language selector in Interviewer settings.',
  },
  hint: {
    id: 'interviewer.language.hint',
    defaultMessage:
      'Choose the language for Interviewer administration on this device. This does not change protocol content, interview language, or collected data.',
    description:
      'Explains that the device administration preference is separate from participant language and research data.',
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

export function LanguageSettings() {
  const intl = useAppIntl();
  const { preference, setPreference, saveState } = useInterviewerLocale();
  const id = useId();
  return (
    <div className="flex flex-col gap-3 py-4">
      <label htmlFor={id} className="font-heading font-bold">
        {intl.formatMessage(messages.label)}
      </label>
      <Paragraph id={`${id}-hint`} margin="none" emphasis="muted">
        {intl.formatMessage(messages.hint)}
      </Paragraph>
      <LocaleSelect
        id={id}
        aria-describedby={`${id}-hint`}
        options={interviewerLocales}
        value={preference}
        onChange={setPreference}
        automaticLabel={intl.formatMessage(messages.automatic)}
        className="max-w-full"
      />
      <Paragraph
        role="status"
        aria-live="polite"
        margin="none"
        className="min-h-lh"
      >
        {saveState === 'saved'
          ? intl.formatMessage(messages.saved)
          : saveState === 'failed'
            ? intl.formatMessage(messages.failed)
            : null}
      </Paragraph>
    </div>
  );
}
