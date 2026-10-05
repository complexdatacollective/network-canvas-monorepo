'use client';

import { useSyncExternalStore, type ReactNode } from 'react';

import { resolveAppLocale } from '@codaco/app-i18n/negotiate';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import {
  frescoLocales,
  frescoTimeZone,
  localeMirrorCookie,
} from '~/i18n/locales';
import { frescoCatalogs } from '~/src/locales/catalogs';

const subscribe = (onChange: () => void) => {
  window.addEventListener('languagechange', onChange);
  return () => window.removeEventListener('languagechange', onChange);
};
function recoveryLocale() {
  let stored: string | null = null;
  try {
    const value = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith(`${localeMirrorCookie}=`))
      ?.slice(localeMirrorCookie.length + 1);
    stored = value ? decodeURIComponent(value) : null;
  } catch {
    // A denied or malformed convenience mirror still permits browser fallback.
  }
  return resolveAppLocale({
    stored,
    requested: navigator.languages,
    locales: frescoLocales,
    defaultLocale: 'en',
  }).locale;
}

/**
 * Next replaces the entire root layout after a fatal root failure. There is
 * then no request provider to consume, and repeating its failed database read
 * would prevent recovery. Use the mirrored preference/browser after hydration;
 * the deterministic English server snapshot keeps the fallback hydratable.
 */
export default function RecoveryI18nProvider({
  children,
}: {
  children: ReactNode;
}) {
  const locale = useSyncExternalStore(subscribe, recoveryLocale, () => 'en');
  return (
    <html lang={locale} dir="ltr">
      <body>
        <AppI18nProvider
          locale={locale}
          locales={frescoLocales}
          messages={frescoCatalogs[locale]}
          timeZone={frescoTimeZone}
        >
          {children}
        </AppI18nProvider>
      </body>
    </html>
  );
}
