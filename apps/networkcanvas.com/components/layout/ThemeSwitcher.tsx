'use client';

import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

import SharedThemeSwitcher from '@codaco/fresco-ui/navigation/ThemeSwitcher';

type ThemeSwitcherProps = {
  view: 'desktop' | 'mobile';
};

export default function ThemeSwitcher({ view }: ThemeSwitcherProps) {
  const { setTheme, theme } = useTheme();
  const t = useTranslations('ThemeTranslations');

  return (
    <SharedThemeSwitcher
      labels={{
        label: t('label'),
        triggerLabel: (selectedTheme) =>
          t('triggerLabel', { theme: t(selectedTheme) }),
        light: t('light'),
        dark: t('dark'),
        system: t('system'),
      }}
      onThemeChange={setTheme}
      theme={theme}
      view={view}
    />
  );
}
