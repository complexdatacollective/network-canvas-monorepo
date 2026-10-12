import '@fontsource-variable/nunito';
import '@fontsource-variable/inclusive-sans';
// Resolves to the same hashed URLs the CSS above references, for the preloads
// below. Latin only: every site locale's glyphs are in that subset.
import inclusiveSansLatin from '@fontsource-variable/inclusive-sans/files/inclusive-sans-latin-wght-normal.woff2';
import nunitoLatin from '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2';

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
import { preload } from 'react-dom';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import { PostHogClientProvider } from '~/components/Providers/posthog-provider';
import { ThemeProvider } from '~/components/Providers/theme-provider';
import {
  getLocaleDirection,
  siteAppCatalogSource,
  siteAppLocales,
} from '~/lib/i18n/appLocales';
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
        'zh-Hans': 'https://networkcanvas.com/zh-Hans',
        'zh-Hant': 'https://networkcanvas.com/zh-Hant',
        'de': 'https://networkcanvas.com/de',
        'nl': 'https://networkcanvas.com/nl',
        'pt-BR': 'https://networkcanvas.com/pt-BR',
        'it': 'https://networkcanvas.com/it',
        'fr': 'https://networkcanvas.com/fr',
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
  const appMessages = await siteAppCatalogSource.load(locale);

  // Not <link> elements: React hoists preloads into <head> itself, emitting
  // each tag twice. crossOrigin is required even same-origin — @font-face
  // always fetches in CORS mode, and without it the font downloads twice.
  for (const href of [nunitoLatin, inclusiveSansLatin]) {
    preload(href, {
      as: 'font',
      type: 'font/woff2',
      crossOrigin: 'anonymous',
    });
  }

  return (
    <html
      lang={locale}
      dir={getLocaleDirection(locale)}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script id="entrance-motion">{entranceMotionScript}</script>
      </head>
      <body className="root overflow-x-hidden">
        {/* Outermost, so every `motion` component on the site inherits it.
            `reducedMotion="user"` is the provider's default: motion then drops
            transform and layout animations by itself for a visitor who prefers
            reduced motion, and keeps the simple ones. That has to live here
            rather than in each component, because a component reading the
            preference to pick its own props would serialise an answer the
            server cannot know into the markup it sends. */}
        <AnimationProvider>
          <PostHogClientProvider>
            <ThemeProvider
              enableSystem
              enableColorScheme
              attribute="data-theme"
              storageKey="networkcanvas-site"
            >
              <NextIntlClientProvider messages={messages}>
                <AppI18nProvider
                  locale={locale}
                  locales={siteAppLocales}
                  messages={appMessages}
                  manageDocument={false}
                  timeZone="UTC"
                >
                  {children}
                </AppI18nProvider>
              </NextIntlClientProvider>
            </ThemeProvider>
          </PostHogClientProvider>
        </AnimationProvider>
      </body>
    </html>
  );
}
