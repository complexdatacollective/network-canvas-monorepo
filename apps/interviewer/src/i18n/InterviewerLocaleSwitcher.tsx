import LocaleSwitcher from '@codaco/fresco-ui/navigation/LocaleSwitcher';

import { useInterviewerLocale } from './InterviewerI18nProvider';
import { interviewerLocales } from './locales';

// The home status row's language control: the popover opens upward from the
// bottom of the screen.
export default function InterviewerLocaleSwitcher() {
  const { preference, automaticLocale, saveState, setPreference } =
    useInterviewerLocale();
  return (
    <LocaleSwitcher
      options={interviewerLocales}
      value={preference}
      automaticLocale={automaticLocale}
      onChange={setPreference}
      saveState={saveState}
      persistence="device"
      side="top"
      align="start"
    />
  );
}
