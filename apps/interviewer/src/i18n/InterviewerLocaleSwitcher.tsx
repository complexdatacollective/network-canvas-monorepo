import { useAppIntl } from '@codaco/app-i18n/react';
import LocaleSwitcher from '@codaco/fresco-ui/navigation/LocaleSwitcher';

import { useInterviewerLocale } from './InterviewerI18nProvider';
import { languageMessages } from './LanguageSettings';
import { interviewerLocales } from './locales';

// The home status row's language control: the popover opens upward from the
// bottom of the screen.
export default function InterviewerLocaleSwitcher() {
  const intl = useAppIntl();
  const { preference, automaticLocale, setPreference } = useInterviewerLocale();
  return (
    <LocaleSwitcher
      options={interviewerLocales}
      value={preference}
      automaticLocale={automaticLocale}
      onChange={setPreference}
      side="top"
      align="start"
      description={intl.formatMessage(languageMessages.description)}
    />
  );
}
