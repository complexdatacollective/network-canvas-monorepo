import type { Decorator } from '@storybook/react-vite';
import { type ReactNode, useEffect } from 'react';

import { ThemedRegion } from '../src/ThemedRegion';

export const THEME_KEY = 'theme';
const COLOR_SCHEME_KEY = 'colorScheme';
const STORAGE_KEY = 'storybook-theme-preference';
const COLOR_SCHEME_STORAGE_KEY = 'storybook-color-scheme-preference';

const themes = {
  dashboard: {
    name: 'Dashboard',
  },
  interview: {
    name: 'Interview',
  },
  studio: {
    name: 'Studio',
  },
} as const;

/**
 * Light/dark is a separate axis from the palette: `dashboard` and `studio`
 * are light/dark pairs, and both switch on `data-theme='dark'` (the attribute
 * apps set via next-themes). `interview` is dark-only and ignores it, so the
 * control is a no-op while that theme is selected.
 */
const colorSchemes = {
  light: {
    name: 'Light',
  },
  dark: {
    name: 'Dark',
  },
} as const;

export type ThemeKey = keyof typeof themes;
export type ColorSchemeKey = keyof typeof colorSchemes;

function readStored<T extends string>(
  key: string,
  valid: Record<T, unknown>,
): T | null {
  try {
    const stored = localStorage.getItem(key);
    if (stored && stored in valid) {
      return stored as T;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Failed to read ${key} from localStorage:`, error);
  }
  return null;
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Failed to save ${key} to localStorage:`, error);
  }
}

function getStoredTheme(): ThemeKey | null {
  return readStored<ThemeKey>(STORAGE_KEY, themes);
}

function getStoredColorScheme(): ColorSchemeKey | null {
  return readStored<ColorSchemeKey>(COLOR_SCHEME_STORAGE_KEY, colorSchemes);
}

/**
 * Mirrors the selected theme onto `<body>`. The themed wrapper only paints
 * the area covered by story content; the surrounding canvas (story padding
 * when layout isn't "fullscreen", scrollbars, the storybook root backdrop)
 * resolves `bg-background` from the body's `theme-base` utility — without the
 * attribute on body that resolves against `:root`'s default palette, leaving
 * stories framed by default-theme chrome. It also themes anything portaled to
 * `document.body`.
 */
function applyThemeToBody(theme: ThemeKey) {
  if (typeof document === 'undefined') return;
  document.body.toggleAttribute('data-theme-interview', theme === 'interview');
  document.body.toggleAttribute('data-theme-studio', theme === 'studio');
}

/**
 * Light/dark goes on `<html>`, matching how apps drive it (next-themes with
 * `attribute="data-theme"`, `<html data-theme="dark">` in Background
 * Creator). The default theme's dark block is written as `[data-theme='dark']`
 * and the studio theme's as `[data-theme='dark'] [data-theme-studio]`, so the
 * document element covers the body mirror AND every themed region below it.
 */
function applyColorSchemeToDocument(colorScheme: ColorSchemeKey) {
  if (typeof document === 'undefined') return;
  if (colorScheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

/**
 * The themed wrapper for a story (or a docs page). `ThemedRegion` is the
 * library's own scoping component: it sets the attribute the theme file keys
 * off, adds `theme-base` so font-family / color / the publish-color variables
 * re-resolve at the region rather than being inherited from the body's cascade
 * context, and brings the portal container so dialogs and popovers render
 * inside the themed subtree. Dashboard is the `:root` default and needs no
 * wrapper.
 */
export function StoryTheme({
  theme,
  children,
}: {
  theme: ThemeKey;
  children: ReactNode;
}) {
  if (theme === 'dashboard') return <>{children}</>;

  return <ThemedRegion theme={theme}>{children}</ThemedRegion>;
}

/**
 * Wraps the story in its themed region and persists both toolbar selections to
 * localStorage so `getInitialTheme()` / `getInitialColorScheme()` can restore
 * them on the next preview load. Storybook's `globalTypes` API doesn't expose
 * an onChange hook directly, so the persistence side effect runs in the same
 * decorator that re-renders when the globals change.
 *
 * Must be the outermost decorator so the themed region (and the
 * `<PortalContainerProvider>` it bundles) wraps `<Providers>` — that puts
 * `<Toaster />`, the DialogProvider's dialog map, and any Base UI portals
 * inside the themed subtree.
 */
export const withTheme: Decorator = (Story, context) => {
  const theme =
    (context.globals[THEME_KEY] as ThemeKey | undefined) ?? 'dashboard';
  const colorScheme =
    (context.globals[COLOR_SCHEME_KEY] as ColorSchemeKey | undefined) ??
    'light';

  useEffect(() => {
    writeStored(STORAGE_KEY, theme);
    applyThemeToBody(theme);
  }, [theme]);

  useEffect(() => {
    writeStored(COLOR_SCHEME_STORAGE_KEY, colorScheme);
    applyColorSchemeToDocument(colorScheme);
  }, [colorScheme]);

  return (
    <StoryTheme theme={theme}>
      <Story />
    </StoryTheme>
  );
};

export const globalTypes = {
  [THEME_KEY]: {
    name: 'Theme',
    description: 'Global theme for components',
    defaultValue: getStoredTheme() ?? 'dashboard',
    toolbar: {
      icon: 'paintbrush' as const,
      items: Object.entries(themes).map(([key, { name }]) => ({
        value: key,
        title: name,
      })),
      showName: true,
      dynamicTitle: true,
    },
  },
  [COLOR_SCHEME_KEY]: {
    name: 'Color scheme',
    description:
      'Light or dark mode (ignored by the dark-only interview theme)',
    defaultValue: getStoredColorScheme() ?? 'light',
    toolbar: {
      icon: 'contrast' as const,
      items: Object.entries(colorSchemes).map(([key, { name }]) => ({
        value: key,
        title: name,
      })),
      showName: true,
      dynamicTitle: true,
    },
  },
};

/*
 * Both mirrors run at module load so the very first paint matches the stored
 * preference — without this the toolbar's selection only reaches the document
 * via the withTheme effects post-mount, briefly framing the story in
 * default-theme, light-mode chrome on every reload.
 */

export function getInitialTheme(): ThemeKey {
  const theme = getStoredTheme() ?? 'dashboard';
  applyThemeToBody(theme);
  return theme;
}

export function getInitialColorScheme(): ColorSchemeKey {
  const colorScheme = getStoredColorScheme() ?? 'light';
  applyColorSchemeToDocument(colorScheme);
  return colorScheme;
}
