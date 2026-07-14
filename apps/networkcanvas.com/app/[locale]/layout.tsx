import '@fontsource-variable/nunito';
import '@fontsource-variable/inclusive-sans';
import '~/app/globals.css';
import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { ThemeProvider } from '~/components/Providers/theme-provider';
import { getStaticLocaleParams } from '~/lib/i18n/locales';
import { routing } from '~/lib/i18n/routing';

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

type LocaleMetadataProps = {
  params: Promise<{ locale: string }>;
};

const entranceMotionScript = `document.documentElement.dataset.entranceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'enabled';`;

export const generateStaticParams = getStaticLocaleParams;
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: LocaleMetadataProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const canonical = `https://networkcanvas.com/${locale}`;

  return {
    metadataBase: new URL('https://networkcanvas.com'),
    title: {
      default: t('siteTitle'),
      template: `%s | ${t('siteTitle')}`,
    },
    description: t('siteDescription'),
    icons: {
      icon: '/images/logos/network-canvas-mark.svg',
    },
    alternates: {
      canonical,
      languages: {
        'en-US': 'https://networkcanvas.com/en-US',
        'en-GB': 'https://networkcanvas.com/en-GB',
        'es': 'https://networkcanvas.com/es',
      },
    },
    openGraph: {
      title: t('siteTitle'),
      description: t('siteDescription'),
      url: canonical,
      siteName: t('siteTitle'),
      type: 'website',
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages({ locale });

  return (
    <html lang={locale} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script id="entrance-motion">{entranceMotionScript}</script>
      </head>
      <body className="root overflow-x-hidden">
        <ThemeProvider
          enableSystem
          enableColorScheme
          attribute="data-theme"
          storageKey="networkcanvas-site"
        >
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
