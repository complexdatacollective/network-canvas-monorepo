import type { Metadata } from 'next';
import { Quicksand } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import {
  getNow,
  getTimeZone,
  unstable_setRequestLocale,
} from 'next-intl/server';

import type { LocalesEnum, Messages } from '~/app/types';
import { locales } from '~/app/types';
import AIAssistant from '~/components/ai-assistant';
import { LayoutComponent } from '~/components/Layout';
import { ThemeProvider } from '~/components/Providers/theme-provider';

const quicksand = Quicksand({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
});

export const metadata: Metadata = {
  other: {
    'docsearch:language': 'en',
    'docsearch:version': '1.0.1',
  },
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type MainLayoutProps = {
  children: React.ReactNode;
  params: { locale: LocalesEnum };
};

export default async function MainLayout({
  children,
  params: { locale },
}: MainLayoutProps) {
  // Validate that the incoming `locale` parameter is valid
  const isValidLocale = locales.some((cur) => cur === locale);
  if (!isValidLocale) notFound();

  // setting setRequestLocale to support next-intl for static rendering
  unstable_setRequestLocale(locale);

  const now = await getNow({ locale });
  const timeZone = await getTimeZone({ locale });

  let messages;

  try {
    messages = (await import(`../../messages/${locale}.json`)) as {
      default: Messages;
    };
  } catch (e) {
    notFound();
  }

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${quicksand.className} antialiased`}
    >
      <body className="flex min-h-full flex-col gap-4">
        <ThemeProvider
          enableSystem
          enableColorScheme
          attribute="class"
          storageKey="nc-docs-site"
        >
          <NextIntlClientProvider
            timeZone={timeZone}
            now={now}
            locale={locale}
            messages={messages.default}
          >
            <LayoutComponent>{children}</LayoutComponent>
            <AIAssistant />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
