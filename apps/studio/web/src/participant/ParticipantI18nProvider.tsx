import { useMemo } from 'react';
import type { ReactNode } from 'react';

import { AppI18nProvider, useLocaleCatalog } from '@codaco/app-i18n/react';

import { negotiateStudioLocale, studioLocales } from '../i18n/locales.ts';
import { studioCatalogSource } from '../locales/catalogs.ts';

export default function ParticipantI18nProvider({
  children,
}: {
  children: ReactNode;
}) {
  const locale = useMemo(() => negotiateStudioLocale(null).locale, []);
  const catalog = useLocaleCatalog(studioCatalogSource, locale);
  return (
    <AppI18nProvider
      locale={catalog.locale}
      locales={studioLocales}
      messages={catalog.messages}
    >
      {children}
    </AppI18nProvider>
  );
}
