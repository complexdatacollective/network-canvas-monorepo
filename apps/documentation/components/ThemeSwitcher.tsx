'use client';

import { Moon, Sun, SunMoon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { Button, IconButton } from '@codaco/fresco-ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';

const themeOptions = [
  { id: 'light', icon: Sun },
  { id: 'dark', icon: Moon },
  { id: 'system', icon: SunMoon },
] as const;
const THEME_ICON_STROKE_CLASS = '[&>.lucide]:[stroke-width:3.5]';

type ThemeOption = (typeof themeOptions)[number]['id'];

function isThemeOption(theme: string | undefined): theme is ThemeOption {
  return themeOptions.some((option) => option.id === theme);
}

type ThemeSwitcherProps = {
  view: 'desktop' | 'mobile';
};

export default function ThemeSwitcher({ view }: ThemeSwitcherProps) {
  const [mounted, setMounted] = useState(false);
  const { setTheme, theme } = useTheme();
  const t = useTranslations('ThemeTranslations');

  useEffect(() => setMounted(true), []);

  // Keep the server and first client render identical. next-themes restores the
  // persisted preference after hydration, at which point the control can show
  // the actual configured mode.
  const selectedTheme = mounted && isThemeOption(theme) ? theme : 'system';
  const SelectedIcon =
    themeOptions.find((option) => option.id === selectedTheme)?.icon ?? SunMoon;
  const triggerLabel = t('triggerLabel', {
    theme: t(selectedTheme),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          view === 'desktop' ? (
            <IconButton
              aria-label={triggerLabel}
              icon={<SelectedIcon aria-hidden />}
              size="sm"
              variant="text"
              color="dynamic"
              className={`text-text border-transparent ${THEME_ICON_STROKE_CLASS}`}
            />
          ) : (
            <Button
              aria-label={triggerLabel}
              icon={<SelectedIcon aria-hidden />}
              size="sm"
              variant="text"
              color="dynamic"
              className={`text-text justify-start border-transparent ${THEME_ICON_STROKE_CLASS}`}
            />
          )
        }
      >
        {view === 'mobile' ? triggerLabel : undefined}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={view === 'desktop' ? 'end' : 'start'}
        className="min-w-48"
      >
        <DropdownMenuRadioGroup
          aria-label={t('label')}
          value={selectedTheme}
          onValueChange={(value) => {
            if (isThemeOption(value)) setTheme(value);
          }}
          className="flex flex-col gap-1"
        >
          {themeOptions.map(({ id, icon: OptionIcon }) => (
            <DropdownMenuRadioItem
              key={id}
              value={id}
              closeOnClick
              icon={<OptionIcon aria-hidden />}
              className={THEME_ICON_STROKE_CLASS}
            >
              {t(id)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
