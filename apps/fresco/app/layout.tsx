import { type Metadata, type Viewport } from 'next';
import { Suspense } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import Providers from '~/components/Providers';
import AnalyticsLoader from '~/components/Providers/AnalyticsLoader';
import { env } from '~/env';
import { FrescoI18nProvider } from '~/i18n/FrescoI18nProvider';
import { frescoLocales } from '~/i18n/locales';
import { getFrescoI18nInitialization, getServerIntl } from '~/i18n/server';
import { frescoCatalogSource } from '~/src/locales/catalogs';

import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import '~/styles/globals.css';

const messages = defineMessages({
  pageTitle: {
    id: 'fresco.root.metadata.pageTitle',
    defaultMessage: 'Network Canvas Fresco',
    description:
      'Default browser tab title for Fresco pages that set no title of their own. Keep "Network Canvas Fresco" unchanged in all languages.',
  },
  pageDescription: {
    id: 'fresco.root.metadata.pageDescription',
    defaultMessage: 'Fresco.',
    description:
      'Default page description (search-engine and link-preview metadata) for Fresco pages that set none of their own. Keep "Fresco" unchanged in all languages.',
  },
});

export async function generateMetadata(): Promise<Metadata> {
  const intl = await getServerIntl();
  return {
    title: intl.formatMessage(messages.pageTitle),
    description: intl.formatMessage(messages.pageDescription),
  };
}

export const viewport: Viewport = {
  viewportFit: 'cover',
};

function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <LocalizedRoot>{children}</LocalizedRoot>
    </Suspense>
  );
}

async function LocalizedRoot({ children }: { children: React.ReactNode }) {
  const initial = await getFrescoI18nInitialization();
  const direction =
    frescoLocales.find(({ locale }) => locale === initial.locale)?.direction ??
    'ltr';
  // Passed down rather than loaded by the client provider, so the request's
  // language is in the server render and hydration downloads nothing.
  const catalogMessages = await frescoCatalogSource.load(initial.locale);
  return (
    <html lang={initial.locale} dir={direction}>
      <body className="bg-background publish-colors antialiased">
        <div className="root min-h-dvh">
          <FrescoI18nProvider initial={initial} messages={catalogMessages}>
            <Providers disableAnimations={env.CI ?? false}>
              <Suspense>
                <AnalyticsLoader />
              </Suspense>
              {children}
            </Providers>
          </FrescoI18nProvider>
        </div>
      </body>
    </html>
  );
}

export default RootLayout;
