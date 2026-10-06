'use client';

// The directive leads the file because a Next App Router Server Component may
// import this module directly — Fresco's root layout is exactly that shape —
// and without it Next treats the module as server code and rejects
// `createContext` and the hooks below.

import {
  createContext,
  use,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import type { IntlShape } from 'react-intl';

import { PSEUDO_LOCALE } from './locales.ts';
import type { AppLocale, CatalogMessages, CatalogSource } from './locales.ts';
import { createAppIntl, formatMessageError } from './messages.ts';
import type { AppIntlErrorHandler, MessageDescriptor } from './messages.ts';
import { createPseudoIntl } from './pseudo.ts';

type AppI18nContextValue = Readonly<{
  intl: IntlShape;
  locale: AppLocale;
  locales: readonly AppLocale[];
  setLocale: (locale: string | null) => void;
}>;

const AppI18nContext = createContext<AppI18nContextValue | null>(null);

/**
 * `<html lang>`/`<html dir>` have to be written in the layout phase, not after
 * paint. A passive effect lands one frame late, so an app booting into a
 * stored or negotiated locale paints its first frame under the static HTML's
 * direction — an RTL interface flashing LTR, which is exactly the flash the
 * synchronous negotiation upstream exists to prevent.
 *
 * Server renders have no layout phase and no document to write to, so they
 * fall back to the passive effect, which never runs there either.
 */
const useDocumentEffect =
  typeof document === 'undefined' ? useEffect : useLayoutEffect;

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
  /**
   * IANA zone for date and time arguments; see `createAppIntl`. A Next host
   * must pass the same value here that its server formatter uses, or a
   * timestamp near midnight renders one date on the server and another after
   * hydration.
   */
  timeZone?: string;
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
    timeZone,
    children,
  } = props;

  if (locales.length === 0) {
    throw new Error('AppI18nProvider: the locale registry is empty');
  }
  const declared = locales.find((entry) => entry.locale === locale);
  const active = declared ?? locales[0]!;
  // The catalog was chosen for the locale that was asked for. When that tag
  // is not declared and the registry default stands in for it, keeping the
  // catalog would render one language's words under another's `lang` — so the
  // fallback falls back completely, to the default's own descriptors.
  const activeMessages = declared === undefined ? undefined : messages;

  const intl = useMemo(
    () =>
      active.locale === PSEUDO_LOCALE
        ? createPseudoIntl({ messages: activeMessages, onError, timeZone })
        : createAppIntl({
            locale: active.locale,
            messages: activeMessages,
            onError,
            timeZone,
          }),
    [active.locale, activeMessages, onError, timeZone],
  );

  const setLocale = useCallback(
    (next: string | null) => {
      onLocaleChange?.(next);
    },
    [onLocaleChange],
  );

  useDocumentEffect(() => {
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

type RenderedCatalog = Readonly<{ locale: string; messages: CatalogMessages }>;

const FIRST_RETRY_MS = 1000;
const LONGEST_RETRY_MS = 30_000;

/**
 * Which locale to render, and its messages, for a host whose catalogs load on
 * demand from a `CatalogSource`. Pass the result to `AppI18nProvider` in place
 * of the requested locale: the two differ while a switch is loading.
 *
 * A switch keeps the language already on screen until the new one has
 * loaded, then changes over in one render — never through English, and
 * never with half the interface in each language. A switch that fails to
 * load (offline, say) stays in the current language and keeps trying: at once
 * when the device comes back online, otherwise after a wait that doubles with
 * each failure, up to 30 seconds. The new language arrives without being
 * chosen again, and choosing a different one abandons it. A browser that
 * keeps a failed module import for the life of the page, as Chrome does,
 * answers each retry from that failure, so there it completes only after a
 * reload.
 *
 * With nothing on screen yet there is no language to keep, so the first load
 * suspends rather than render English it would replace a moment later. A
 * client host avoids even that by awaiting `source.load(locale)` before its
 * first render; anywhere else (a component that mounts in a locale the page
 * has not loaded yet) needs a Suspense boundary above it. A server render
 * suspends the same way and streams the result, and hydration waits for the
 * same catalog instead of rendering a mismatch. A failed first load throws to
 * the nearest error boundary.
 *
 * `preloaded` is a catalog delivered some other way — a server passing the
 * request locale's messages down as props — which renders without a load
 * while it matches `locale`.
 */
export function useLocaleCatalog(
  source: CatalogSource,
  locale: string,
  preloaded?: RenderedCatalog,
): RenderedCatalog {
  const peek = () => source.peek(locale);
  const loaded = useSyncExternalStore(source.subscribe, peek, peek);
  const ready = preloaded?.locale === locale ? preloaded.messages : loaded;

  const [rendered, setRendered] = useState<RenderedCatalog | null>(() =>
    ready === undefined ? null : { locale, messages: ready },
  );
  if (
    ready !== undefined &&
    (rendered?.locale !== locale || rendered.messages !== ready)
  ) {
    setRendered({ locale, messages: ready });
  }

  // A host keeps the requested locale in its own state, so choosing the same
  // language again changes nothing here. Counting failures is what re-arms the
  // load below; a different locale starts from none.
  const [failed, setFailed] = useState({ locale, count: 0 });
  const failures = failed.locale === locale ? failed.count : 0;

  useEffect(() => {
    if (ready !== undefined) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const retry = () => {
      if (active) setFailed({ locale, count: failures + 1 });
    };
    source.load(locale).catch(() => {
      if (!active) return;
      timer = setTimeout(
        retry,
        Math.min(FIRST_RETRY_MS * 2 ** failures, LONGEST_RETRY_MS),
      );
      window.addEventListener('online', retry, { once: true });
    });
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('online', retry);
    };
  }, [source, locale, ready, failures]);

  if (ready !== undefined) return { locale, messages: ready };
  if (rendered !== null) return rendered;
  return { locale, messages: use(source.attempt(locale)) };
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

/**
 * A subscribed message node for queued notifications and dialogs. Keeping the
 * descriptor in a React node lets existing content follow a locale switch;
 * formatting to a string when a task starts would freeze the old language.
 * Like useAppIntl, this renders English defaults without a provider.
 */
export function AppMessage({
  message,
  values,
}: Readonly<{
  message: MessageDescriptor;
  values?: Parameters<IntlShape['formatMessage']>[1];
}>) {
  const intl = useAppIntl();
  return <>{intl.formatMessage(message, values)}</>;
}

/** A stored string error that follows the active locale without rerunning its operation. */
export function AppErrorMessage({ error }: Readonly<{ error: string }>) {
  const intl = useAppIntl();
  return <>{formatMessageError(error, intl) ?? error}</>;
}
