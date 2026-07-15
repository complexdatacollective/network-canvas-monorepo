'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
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
  { id: 'system', icon: Monitor },
] as const;
const THEME_ICON_STROKE_WIDTH = 3.5;

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
    themeOptions.find((option) => option.id === selectedTheme)?.icon ?? Monitor;
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
              icon={
                <SelectedIcon
                  aria-hidden
                  strokeWidth={THEME_ICON_STROKE_WIDTH}
                />
              }
              size="lg"
              variant="text"
              color="dynamic"
              className="text-text border-transparent"
            />
          ) : (
            <Button
              aria-label={triggerLabel}
              icon={
                <SelectedIcon
                  aria-hidden
                  strokeWidth={THEME_ICON_STROKE_WIDTH}
                />
              }
              size="sm"
              variant="text"
              color="dynamic"
              className="text-text justify-start border-transparent"
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
            <DropdownMenuRadioItem key={id} value={id} closeOnClick>
              <OptionIcon aria-hidden strokeWidth={THEME_ICON_STROKE_WIDTH} />
              {t(id)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
