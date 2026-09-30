import LocaleSwitcher from '@codaco/fresco-ui/navigation/LocaleSwitcher';
import { cx } from '~/utils/cva';

import { useArchitectLocale } from './ArchitectI18nProvider';
import { architectLocales } from './locales';

type ArchitectLocaleSwitcherProps = {
  /** The trigger's look: the row it sits among supplies it. */
  className: string;
};

/** The header's language control, dressed as one of its navigation items. */
export default function ArchitectLocaleSwitcher({
  className,
}: ArchitectLocaleSwitcherProps) {
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
      display="label"
      renderTrigger={
        // Named by the switcher, which sets the language on it at runtime.
        // oxlint-disable-next-line jsx-a11y/control-has-associated-label
        <button
          type="button"
          className={cx(
            'inline-flex cursor-pointer items-center border-0 bg-transparent p-0',
            className,
          )}
        />
      }
    />
  );
}
