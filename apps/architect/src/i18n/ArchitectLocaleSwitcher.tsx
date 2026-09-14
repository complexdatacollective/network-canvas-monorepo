import LocaleSwitcher from '@codaco/fresco-ui/navigation/LocaleSwitcher';

import { useArchitectLocale } from './ArchitectI18nProvider';
import { architectLocales } from './locales';

export default function ArchitectLocaleSwitcher() {
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
    />
  );
}
