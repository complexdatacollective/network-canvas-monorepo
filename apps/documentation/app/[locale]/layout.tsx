import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import '@codaco/tailwind-config/fonts/readex-pro.css';
// Resolve to the same hashed URLs the CSS above references, for the preloads
// below. Latin only: every documentation locale's glyphs are in that subset.
import inclusiveSansLatin from '@fontsource-variable/inclusive-sans/files/inclusive-sans-latin-wght-normal.woff2';
import nunitoLatin from '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2';
import { GoogleAnalytics } from '@next/third-parties/google';
import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getNow, getTimeZone, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { preload } from 'react-dom';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import LocaleDirectionProvider from '@codaco/fresco-ui/LocaleDirectionProvider';
import type { Messages } from '~/app/types';
import { LayoutComponent } from '~/components/Layout';
import { PostHogClientProvider } from '~/components/Providers/posthog-provider';
import { ThemeProvider } from '~/components/Providers/theme-provider';
import { env } from '~/env';
import {
  documentationAppCatalogSource,
  documentationAppLocales,
  getLocaleDirection,
} from '~/lib/i18n/appLocales';
import { locales } from '~/lib/i18n/locales';
import { routing } from '~/lib/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  const metadata: Metadata = {
    other: {
      'docsearch:language': locale,
      'docsearch:version': '1.0.1',
    },
  };

  return metadata;
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type MainLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function MainLayout(props: MainLayoutProps) {
  const { children } = props;

  // Validate that the incoming `locale` parameter is valid
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // setting setRequestLocale to support next-intl for static rendering
  setRequestLocale(locale);

  const now = await getNow({ locale });
  const timeZone = await getTimeZone({ locale });

  let messages: { default: Messages };

  try {
    messages = await import(`../../messages/${locale}.json`);
  } catch (_e) {
    notFound();
  }

  // The shared packages' messages, for the fresco-ui components that have
  // their own (the footer's language switcher).
  const appMessages = await documentationAppCatalogSource.load(locale);

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
      suppressHydrationWarning
    >
      <body className="flex min-h-dvh flex-col">
        {/* Outermost, so every `motion` component in the docs inherits it.
            `reducedMotion="user"` is the provider's default: motion then drops
            transform and layout animations by itself for a reader who prefers
            reduced motion, and keeps the simple ones. It belongs here rather
            than in each component, because a component reading the preference
            to pick its own props would serialise an answer the server cannot
            know into the markup it sends. */}
        <AnimationProvider>
          <PostHogClientProvider>
            <ThemeProvider
              enableSystem
              enableColorScheme
              attribute="data-theme"
              storageKey="nc-docs-site"
            >
              <NextIntlClientProvider
                timeZone={timeZone}
                now={now}
                locale={locale}
                messages={messages.default}
              >
                <AppI18nProvider
                  locale={locale}
                  locales={documentationAppLocales}
                  messages={appMessages}
                  manageDocument={false}
                  timeZone={timeZone}
                >
                  <LocaleDirectionProvider>
                    <LayoutComponent>{children}</LayoutComponent>
                  </LocaleDirectionProvider>
                </AppI18nProvider>
              </NextIntlClientProvider>
            </ThemeProvider>
          </PostHogClientProvider>
        </AnimationProvider>
      </body>
      <GoogleAnalytics gaId={env.NEXT_PUBLIC_GA_ID} />
    </html>
  );
}
