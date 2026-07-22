import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
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

  const canonical = `https://networkcanvas.com/${locale}/summer-2026-update`;

  return {
    title: 'Introducing the next generation of Network Canvas apps',
    description:
      'Meet the redesigned Architect and Interviewer apps, Fresco 4.0.0, and the new Schema 8 protocol format.',
    alternates: {
      canonical,
      languages: {
        'en-US': 'https://networkcanvas.com/en-US/summer-2026-update',
        'en-GB': 'https://networkcanvas.com/en-GB/summer-2026-update',
        'es': 'https://networkcanvas.com/es/summer-2026-update',
      },
    },
    openGraph: {
      title: 'Introducing the next generation of Network Canvas apps',
      description:
        'Meet the redesigned Architect and Interviewer apps, Fresco 4.0.0, and the new Schema 8 protocol format.',
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
