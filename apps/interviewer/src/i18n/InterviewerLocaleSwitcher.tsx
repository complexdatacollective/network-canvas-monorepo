import LocaleSwitcher from '@codaco/fresco-ui/navigation/LocaleSwitcher';

import { useInterviewerLocale } from './InterviewerI18nProvider';
import { interviewerLocales } from './locales';

// The home header's language control, styled as one of the top action bar's
// glass icon buttons so it reads as the settings button's sibling.
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
      display="icon"
      variant="glass"
      color="default"
      size="md"
      className="border-outline"
    />
  );
}
