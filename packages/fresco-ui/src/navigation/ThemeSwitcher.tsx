'use client';

import { Moon, Sun, SunMoon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button, IconButton } from '../Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../DropdownMenu';

const themeOptions = [
  { id: 'light', icon: Sun },
  { id: 'dark', icon: Moon },
  { id: 'system', icon: SunMoon },
] as const;

const THEME_ICON_STROKE_CLASS = '[&>.lucide]:[stroke-width:3.5]';

export type ThemeSwitcherTheme = (typeof themeOptions)[number]['id'];

export type ThemeSwitcherLabels = Record<ThemeSwitcherTheme, string> & {
  label: string;
  triggerLabel: (theme: ThemeSwitcherTheme) => string;
};

export type ThemeSwitcherProps = {
  labels: ThemeSwitcherLabels;
  onThemeChange: (theme: ThemeSwitcherTheme) => void;
  theme?: string;
  view: 'desktop' | 'mobile';
};

function isThemeSwitcherTheme(
  theme: string | undefined,
): theme is ThemeSwitcherTheme {
  return themeOptions.some((option) => option.id === theme);
}

/**
 * A controlled colour-theme picker for use in the shared site navigation.
 * Hosts provide their theme-provider state and translated labels so this
 * component stays independent of framework-specific theme and i18n libraries.
 */
export default function ThemeSwitcher({
  labels,
  onThemeChange,
  theme,
  view,
}: ThemeSwitcherProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Keep the server and first client render identical. The host's theme
  // provider can restore a persisted preference after hydration, at which
  // point the control shows the configured mode.
  const selectedTheme =
    mounted && isThemeSwitcherTheme(theme) ? theme : 'system';
  const SelectedIcon =
    themeOptions.find((option) => option.id === selectedTheme)?.icon ?? SunMoon;
  const triggerLabel = labels.triggerLabel(selectedTheme);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          view === 'desktop' ? (
            <IconButton
              aria-label={triggerLabel}
              icon={<SelectedIcon aria-hidden />}
              size="lg"
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
          aria-label={labels.label}
          value={selectedTheme}
          onValueChange={(value) => {
            if (isThemeSwitcherTheme(value)) onThemeChange(value);
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
              {labels[id]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
