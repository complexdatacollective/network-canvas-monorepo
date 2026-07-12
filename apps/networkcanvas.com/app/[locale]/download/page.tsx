import { hasLocale } from 'next-intl';
import { notFound, permanentRedirect } from 'next/navigation';

import { routing } from '~/lib/i18n/routing';

type DownloadPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function DownloadPage({ params }: DownloadPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  permanentRedirect(`/${locale}/get-started`);
  return null;
}
