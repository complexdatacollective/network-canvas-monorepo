import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { SummerUpdatePage } from '~/components/summer-update/SummerUpdatePage';
import { routing } from '~/lib/i18n/routing';

type SummerUpdateRouteProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: SummerUpdateRouteProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const t = await getTranslations({ locale, namespace: 'SummerUpdate' });
  const canonical = `https://networkcanvas.com/${locale}/summer-2026-update`;

  return {
    title: t('metadata.title'),
    description: t('metadata.description'),
    alternates: {
      canonical,
      languages: {
        'en-US': 'https://networkcanvas.com/en-US/summer-2026-update',
        'en-GB': 'https://networkcanvas.com/en-GB/summer-2026-update',
        'es': 'https://networkcanvas.com/es/summer-2026-update',
      },
    },
    openGraph: {
      title: t('metadata.title'),
      description: t('metadata.description'),
      url: canonical,
      type: 'article',
    },
  };
}

export default async function SummerUpdateRoute({
  params,
}: SummerUpdateRouteProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);

  return <SummerUpdatePage />;
}
