'use client';

import type { ReactNode } from 'react';

import {
  type CatalogMessages,
  defineAppLocales,
} from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';

/** The language the built-in messages are written in, and the only one. */
const BUILT_IN_LOCALES = defineAppLocales([
  { locale: 'en', label: 'English', direction: 'ltr' },
]);

/** English renders from the messages' own descriptors, with no catalog. */
const NO_CATALOG: CatalogMessages = Object.freeze({});

/**
 * The interview's built-in messages, in English. Every word the interview
 * shows comes from the protocol, in the language the interview negotiates
 * from the protocol's own (see `ProtocolLocalizationProvider`): its interface
 * text stands in for the built-in messages (see `InterfaceTextOverlay`), and
 * its stages hold their own wording. What stays built in is text only screen
 * readers read, such as announcements and accessible names, which is English
 * until it can be localised too.
 *
 * Nothing loads, so nothing suspends and nothing can fail to load.
 */
export function InterviewI18nProvider({ children }: { children: ReactNode }) {
  return (
    <AppI18nProvider
      locale="en"
      locales={BUILT_IN_LOCALES}
      messages={NO_CATALOG}
      manageDocument={false}
    >
      {children}
    </AppI18nProvider>
  );
}
