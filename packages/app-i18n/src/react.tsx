import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import type { ReactNode } from 'react';
import type { IntlShape } from 'react-intl';

import { PSEUDO_LOCALE } from './locales.ts';
import type { AppLocale, CatalogMessages } from './locales.ts';
import { createAppIntl } from './messages.ts';
import type { AppIntlErrorHandler } from './messages.ts';

type AppI18nContextValue = Readonly<{
  intl: IntlShape;
  locale: AppLocale;
  locales: readonly AppLocale[];
  setLocale: (locale: string | null) => void;
}>;

const AppI18nContext = createContext<AppI18nContextValue | null>(null);

let sharedDefaultIntl: IntlShape | undefined;

/**
 * The provider-less fallback: an English formatter over no catalog, so every
 * descriptor renders its defaultMessage. This is what lets shared packages
 * (fresco-ui, interview) adopt descriptors without requiring hosts to mount
 * anything.
 */
const getDefaultIntl = (): IntlShape => {
  sharedDefaultIntl ??= createAppIntl({ locale: 'en' });
  return sharedDefaultIntl;
};

const PSEUDO_MAP: Readonly<Record<string, string>> = {
  a: 'á',
  e: 'é',
  i: 'î',
  o: 'ö',
  u: 'û',
  y: 'ý',
  A: 'Å',
  E: 'É',
  I: 'Î',
  O: 'Ö',
  U: 'Û',
  Y: 'Ý',
};

const pseudoString = (value: string): string => {
  const accented = value.replace(/[aeiouyAEIOUY]/g, (ch) => {
    const mapped = PSEUDO_MAP[ch];
    return mapped === undefined ? ch : mapped;
  });
  const padding = '·'.repeat(Math.max(1, Math.ceil(accented.length * 0.3)));
  return `[${accented}${padding}]`;
};

const pseudoValue = (value: unknown): unknown => {
  if (typeof value === 'string') return pseudoString(value);
  if (Array.isArray(value)) {
    return value.map((part) =>
      typeof part === 'string' ? pseudoString(part) : part,
    );
  }
  return value;
};

/** Wraps a formatter so message output is accented and expanded (en-XA). */
const wrapIntlForPseudo = (intl: IntlShape): IntlShape => {
  const formatMessage = ((descriptor, values, opts) =>
    pseudoValue(
      intl.formatMessage(descriptor, values, opts),
    )) as IntlShape['formatMessage'];
  return { ...intl, formatMessage };
};

export type AppI18nProviderProps = Readonly<{
  /**
   * Active locale tag: one of `locales`, or the pseudo-locale.
   *
   * A tag the registry does not declare renders as `locales[0]` rather than
   * throwing. A provider wraps the whole application, so a bad tag — a stored
   * preference from a build that offered more locales, a hand-edited
   * `localStorage`, a host passing something through — must degrade to a
   * readable screen instead of a blank one. The negotiation in `./negotiate`
   * is what is supposed to guarantee the tag, and it only ever returns a
   * declared locale; this is the backstop for everything that does not go
   * through it.
   */
  locale: string;
  /** The app's declared registry. */
  locales: readonly AppLocale[];
  /** Merged catalogs for the active locale (common → shared → app). */
  messages?: CatalogMessages;
  /** The host's persistence hook; `null` means "revert to negotiation". */
  onLocaleChange?: (locale: string | null) => void;
  /** Write `<html lang>`/`<html dir>` for the active locale. Default true. */
  manageDocument?: boolean;
  onError?: AppIntlErrorHandler;
  children: ReactNode;
}>;

export function AppI18nProvider(props: AppI18nProviderProps) {
  const {
    locale,
    locales,
    messages,
    onLocaleChange,
    manageDocument = true,
    onError,
    children,
  } = props;

  if (locales.length === 0) {
    throw new Error('AppI18nProvider: the locale registry is empty');
  }
  const active =
    locales.find((entry) => entry.locale === locale) ?? locales[0]!;

  const intl = useMemo(() => {
    const base = createAppIntl({ locale: active.locale, messages, onError });
    return active.locale === PSEUDO_LOCALE ? wrapIntlForPseudo(base) : base;
  }, [active.locale, messages, onError]);

  const setLocale = useCallback(
    (next: string | null) => {
      onLocaleChange?.(next);
    },
    [onLocaleChange],
  );

  useEffect(() => {
    if (!manageDocument) return;
    const root = document.documentElement;
    root.lang = active.locale;
    root.dir = active.direction;
  }, [manageDocument, active.locale, active.direction]);

  const value = useMemo<AppI18nContextValue>(
    () => ({ intl, locale: active, locales, setLocale }),
    [intl, active, locales, setLocale],
  );

  return (
    <AppI18nContext.Provider value={value}>{children}</AppI18nContext.Provider>
  );
}

/**
 * The formatter every localized component uses. Works with or without a
 * mounted provider: without one, descriptors render their English
 * defaultMessage — shared components must use this, never react-intl's
 * useIntl (which throws without a provider).
 */
export function useAppIntl(): IntlShape {
  const context = useContext(AppI18nContext);
  return context === null ? getDefaultIntl() : context.intl;
}

/**
 * Locale state for switch UI. Requires a provider: a host that mounts no
 * AppI18nProvider has no locale to switch.
 */
export function useAppLocale(): Readonly<{
  locale: string;
  direction: 'ltr' | 'rtl';
  locales: readonly AppLocale[];
  setLocale: (locale: string | null) => void;
}> {
  const context = useContext(AppI18nContext);
  if (context === null) {
    throw new Error('useAppLocale requires an AppI18nProvider ancestor');
  }
  return {
    locale: context.locale.locale,
    direction: context.locale.direction,
    locales: context.locales,
    setLocale: context.setLocale,
  };
}
