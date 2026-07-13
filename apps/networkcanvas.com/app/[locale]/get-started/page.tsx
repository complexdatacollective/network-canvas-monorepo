import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { PageBackground } from '@codaco/art';
import { GetStartedIntro } from '~/components/get-started/GetStartedIntro';
import { WorkflowPath } from '~/components/get-started/WorkflowPath';
import { Footer } from '~/components/layout/Footer';
import { classicApps, webApps } from '~/lib/getStarted';
import { routing } from '~/lib/i18n/routing';

type GetStartedPageProps = {
  params: Promise<{ locale: string }>;
};

const designApps = [
  ...webApps.filter((app) => app.workflow === 'design'),
  ...classicApps.filter((app) => app.workflow === 'design'),
];
const collectApps = [
  ...webApps.filter((app) => app.workflow === 'collect'),
  ...classicApps.filter((app) => app.workflow === 'collect'),
];

export async function generateMetadata({
  params,
}: GetStartedPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const t = await getTranslations({ locale, namespace: 'GetStarted' });

  return {
    title: t('metadata.title'),
    description: t('metadata.description'),
    alternates: {
      canonical: `https://networkcanvas.com/${locale}/get-started`,
      languages: {
        'en-US': 'https://networkcanvas.com/en-US/get-started',
        'en-GB': 'https://networkcanvas.com/en-GB/get-started',
        'es': 'https://networkcanvas.com/es/get-started',
      },
    },
  };
}

export default async function GetStartedPage({ params }: GetStartedPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);

  return (
    <main className="homepage-body relative isolate">
      <PageBackground />
      <div className="relative z-10">
        <GetStartedIntro />
        <WorkflowPath workflow="design" apps={designApps} />
        <WorkflowPath workflow="collect" apps={collectApps} />
        <Footer />
      </div>
    </main>
  );
}
