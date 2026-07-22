import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { SummerUpdatePage } from '~/components/summer-update/SummerUpdatePage';

type SummerUpdateRouteProps = {
  params: Promise<{ locale: string }>;
};

function isEnglishLocale(locale: string) {
  return locale === 'en-US' || locale === 'en-GB';
}

export async function generateMetadata({
  params,
}: SummerUpdateRouteProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isEnglishLocale(locale)) notFound();

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
  if (!isEnglishLocale(locale)) notFound();

  setRequestLocale(locale);

  return <SummerUpdatePage />;
}
