'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { resolveAppLocale } from '@codaco/app-i18n/negotiate';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import { updateLocale } from '~/actions/locale';
import {
  frescoLocales,
  frescoTimeZone,
  isFrescoLocale,
  localeMirrorCookie,
} from '~/i18n/locales';
import type { FrescoI18nInitialization } from '~/i18n/resolve';
import { frescoCatalogs } from '~/src/locales/catalogs';

type LocaleState = {
  preference: string | null;
  saving: boolean;
  failed: boolean;
  setLocale: (locale: string | null) => void;
};
const LocaleContext = createContext<LocaleState | null>(null);

export function FrescoI18nProvider({
  initial,
  children,
}: {
  initial: FrescoI18nInitialization;
  children: ReactNode;
}) {
  // Remount on identity changes; queued operations still carry expectedUserId
  // and are refused by the action if authentication changed meanwhile.
  return (
    <LocaleSession key={initial.userId ?? 'signed-out'} initial={initial}>
      {children}
    </LocaleSession>
  );
}

function LocaleSession({
  initial,
  children,
}: {
  initial: FrescoI18nInitialization;
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState({
    preference: initial.preference,
    locale: initial.locale,
  });
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(false);
  const acknowledged = useRef(state);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current += 1;
    };
  }, []);

  useEffect(() => {
    if (pending.current) return;
    acknowledged.current = {
      preference: initial.preference,
      locale: initial.locale,
    };
    setState(acknowledged.current);
    // A request's account is authoritative, including Automatic. Keep the
    // mirror agreeing after sign-in without a client-side renegotiation flash.
    try {
      document.cookie = `${localeMirrorCookie}=${initial.preference ?? ''}; Path=/; SameSite=Lax; Max-Age=${initial.preference === null ? 0 : 31536000}`;
    } catch {
      /* Cookie policy can disable the convenience mirror. */
    }
  }, [initial.locale, initial.preference]);

  const setLocale = useCallback(
    (preference: string | null) => {
      if (preference !== null && !isFrescoLocale(preference)) return;
      const locale = resolveAppLocale({
        stored: preference,
        requested: navigator.languages,
        locales: frescoLocales,
        defaultLocale: 'en',
      }).locale;

      setState({ preference, locale });
      setFailed(false);
      setSaving(true);
      pending.current = true;
      const generation = ++sequence.current;
      queue.current = queue.current
        .catch(() => undefined)
        .then(async () => {
          if (!mounted.current || generation !== sequence.current) return;
          try {
            const result = await updateLocale(preference, initial.userId);
            if (mounted.current && result.success)
              acknowledged.current = { preference, locale };
            if (!mounted.current || generation !== sequence.current) return;
            if (!result.success)
              throw new Error('Locale preference was not saved');
            pending.current = false;
            setSaving(false);
            router.refresh();
          } catch {
            if (!mounted.current || generation !== sequence.current) return;
            pending.current = false;
            setSaving(false);
            setFailed(true);
            setState(acknowledged.current);
          }
        });
    },
    [initial.userId, router],
  );

  useEffect(() => {
    if (state.preference !== null) return undefined;
    const followBrowser = () => {
      const locale = resolveAppLocale({
        requested: navigator.languages,
        locales: frescoLocales,
        defaultLocale: 'en',
      }).locale;
      setState({ preference: null, locale });
      router.refresh();
    };
    window.addEventListener('languagechange', followBrowser);
    return () => window.removeEventListener('languagechange', followBrowser);
  }, [router, state.preference]);

  return (
    <LocaleContext.Provider
      value={{ preference: state.preference, saving, failed, setLocale }}
    >
      <AppI18nProvider
        locale={state.locale}
        locales={frescoLocales}
        messages={frescoCatalogs[state.locale]}
        timeZone={frescoTimeZone}
        onLocaleChange={setLocale}
      >
        {children}
      </AppI18nProvider>
    </LocaleContext.Provider>
  );
}

export function useFrescoLocale() {
  const context = useContext(LocaleContext);
  if (!context)
    throw new Error('Fresco locale controls need FrescoI18nProvider');
  return context;
}
