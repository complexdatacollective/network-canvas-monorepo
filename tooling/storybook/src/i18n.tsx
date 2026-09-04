import { DirectionProvider } from '@base-ui/react/direction-provider';
import type { Decorator } from '@storybook/react-vite';
import { useEffect, useLayoutEffect } from 'react';

import {
  type AppLocale,
  type CatalogMessages,
  PSEUDO_LOCALE,
  pseudoAppLocale,
} from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';

/**
 * Storybook's language and writing-direction controls, shared by every
 * Storybook in the repo (2026-09-04 localization design §9).
 *
 * They are here rather than in `@codaco/fresco-ui` because they are
 * development configuration, not part of the component library's published
 * API — the same reason `@codaco/vitest-config` and `@codaco/tsconfig` live
 * alongside this. A Storybook adopts them by calling `storybookI18n()` with
 * its own registry and catalogs, so `fresco-ui`, `interview` and each app get
 * one implementation and their own locales.
 *
 * Two controls, because they answer two different questions:
 *
 * - **Language** proves a component reads its copy from a catalog. Switching
 *   it should visibly change every string a component owns; anything that
 *   stays in English is hardcoded. The pseudo-locale makes that verdict
 *   available before any translation exists.
 * - **Direction** proves a component lays out with logical properties. It is
 *   a separate axis on purpose: no right-to-left locale ships yet, so binding
 *   direction to language would leave RTL untestable until one does. Left on
 *   "Automatic" it follows the selected locale's declared direction, which is
 *   what a real host does.
 */

const LOCALE_KEY = 'appLocale';
const DIRECTION_KEY = 'appDirection';
const LOCALE_STORAGE_KEY = 'storybook-app-locale-preference';
const DIRECTION_STORAGE_KEY = 'storybook-app-direction-preference';

/** `auto` defers to the active locale's declared direction. */
const directionModes = {
  auto: { name: 'Automatic' },
  ltr: { name: 'LTR' },
  rtl: { name: 'RTL' },
} as const;

export type DirectionMode = keyof typeof directionModes;

export type StorybookI18nOptions = Readonly<{
  /**
   * The Storybook's locale registry. Usually `ecosystemLocales` for a shared
   * package, or the app's own registry for an app.
   */
  locales: readonly AppLocale[];
  /**
   * Messages per locale, already merged in host order
   * (common → shared packages → app). A locale with no entry renders from the
   * descriptors' own `defaultMessage`s, which is correct for the source
   * language and a visible gap for any other.
   */
  catalogs: Readonly<Record<string, CatalogMessages>>;
  /** Which locale a Storybook with no stored preference opens in. */
  defaultLocale?: string;
  /**
   * Whether to offer the pseudo-locale. On by default: it is the only way to
   * see untranslated strings and clipped layouts before translations exist.
   */
  includePseudoLocale?: boolean;
}>;

export type StorybookI18n = Readonly<{
  globalTypes: Record<string, unknown>;
  initialGlobals: Readonly<{ appLocale: string; appDirection: DirectionMode }>;
  withAppI18n: Decorator;
}>;

function readStored<T extends string>(
  key: string,
  valid: (value: string) => value is T,
): T | null {
  try {
    const stored = localStorage.getItem(key);
    return stored !== null && valid(stored) ? stored : null;
  } catch {
    // A Storybook running where storage is unavailable (a sandboxed iframe,
    // a browser with site data blocked) still has to render — it just opens
    // on the default every time.
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Persisting a toolbar choice is a convenience; failing to is not worth
    // a console the story author has to read past.
  }
}

export function storybookI18n(options: StorybookI18nOptions): StorybookI18n {
  const {
    locales,
    catalogs,
    defaultLocale = locales[0]?.locale ?? 'en',
    includePseudoLocale = true,
  } = options;

  if (locales.length === 0) {
    throw new Error('storybookI18n: the locale registry is empty');
  }

  // The pseudo-locale is appended rather than expected in the registry: a
  // production registry must never contain it, so every caller would
  // otherwise have to build a Storybook-only copy of its own list.
  const offered: readonly AppLocale[] =
    includePseudoLocale &&
    !locales.some((entry) => entry.locale === PSEUDO_LOCALE)
      ? [...locales, pseudoAppLocale]
      : locales;

  const isOffered = (value: string): value is string =>
    offered.some((entry) => entry.locale === value);
  const isDirectionMode = (value: string): value is DirectionMode =>
    value in directionModes;

  const initialLocale =
    readStored(LOCALE_STORAGE_KEY, isOffered) ?? defaultLocale;
  const initialDirection =
    readStored(DIRECTION_STORAGE_KEY, isDirectionMode) ?? 'auto';

  const withAppI18n: Decorator = (Story, context) => {
    const locale =
      (context.globals[LOCALE_KEY] as string | undefined) ?? defaultLocale;
    const mode =
      (context.globals[DIRECTION_KEY] as DirectionMode | undefined) ?? 'auto';

    const declared =
      offered.find((entry) => entry.locale === locale)?.direction ?? 'ltr';
    const direction = mode === 'auto' ? declared : mode;

    useEffect(() => {
      writeStored(LOCALE_STORAGE_KEY, locale);
    }, [locale]);
    useEffect(() => {
      writeStored(DIRECTION_STORAGE_KEY, mode);
    }, [mode]);

    // The preview is its own iframe, so writing these mirrors the story canvas
    // and nothing else — Storybook's sidebar, toolbar and panels live in the
    // manager document and stay in the reader's own direction.
    //
    // It has to be the document rather than the wrapper alone. Dialogs,
    // popovers, menus and toasts portal to `document.body`, which is outside
    // any wrapper a decorator can render, so a scoped `dir` leaves exactly the
    // components whose RTL behaviour is worth checking rendering
    // left-to-right.
    //
    // Set on mount and never restored, deliberately. Restoring a remembered
    // value is what made this leak between stories: a story that forces RTL
    // (`globals: { appDirection: 'rtl' }`) would hand the document back at a
    // moment the next story had already claimed it, and an unrelated story
    // then ran mirrored — arrow keys moving the wrong way and a click at
    // `rect.right` landing at the visual start. Every story sets what it
    // wants, so there is nothing to hand back. Layout effect rather than
    // effect so it lands before the story paints, and before a play function
    // measures anything.
    useLayoutEffect(() => {
      const root = document.documentElement;
      root.lang = locale;
      root.dir = direction;
    }, [locale, direction]);

    return (
      <AppI18nProvider
        locale={locale}
        locales={offered}
        messages={catalogs[locale]}
        // The effect above owns `<html lang>`/`<html dir>` instead, because
        // the toolbar's direction is an override the provider cannot see: it
        // would write the locale's own direction and undo an explicit RTL
        // selection on every render.
        manageDocument={false}
      >
        {/*
          Base UI reads direction from context, not from the DOM, and uses it
          for popover placement and for which arrow key moves where. Without
          this provider a story's CSS mirrors while its dropdowns, tabs and
          menus keep behaving as LTR — so the switcher would show a layout
          that looks right and hide the interaction bugs it exists to find.
        */}
        <DirectionProvider direction={direction}>
          {/*
            `contents` so the wrapper contributes no box of its own: a story
            laid out by its parent (a grid cell, a flex child) must not gain
            an anonymous block between it and that parent.
          */}
          <div dir={direction} className="contents">
            <Story />
          </div>
        </DirectionProvider>
      </AppI18nProvider>
    );
  };

  return {
    withAppI18n,
    initialGlobals: {
      [LOCALE_KEY]: initialLocale,
      [DIRECTION_KEY]: initialDirection,
    },
    globalTypes: {
      [LOCALE_KEY]: {
        name: 'Language',
        description: 'Locale the story renders in',
        toolbar: {
          icon: 'globe' as const,
          items: offered.map((entry) => ({
            value: entry.locale,
            title: entry.label,
          })),
          showName: true,
          dynamicTitle: true,
        },
      },
      [DIRECTION_KEY]: {
        name: 'Direction',
        description: "Writing direction, or the locale's own",
        toolbar: {
          icon: 'transfer' as const,
          items: Object.entries(directionModes).map(([value, { name }]) => ({
            value,
            title: name,
          })),
          showName: true,
          dynamicTitle: true,
        },
      },
    },
  };
}
