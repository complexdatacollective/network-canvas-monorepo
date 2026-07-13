import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { PageBackground } from '@codaco/art';
import { Footer } from '~/components/layout/Footer';
import { CoreTeam } from '~/components/sections/CoreTeam';
import { DesignPrinciples } from '~/components/sections/DesignPrinciples';
import { Grants } from '~/components/sections/Grants';
import { HeroIntro } from '~/components/sections/HeroIntro';
import { Institutions } from '~/components/sections/Institutions';
import { Publications } from '~/components/sections/Publications';
import { ScientificAdvisors } from '~/components/sections/ScientificAdvisors';
import { Tools } from '~/components/sections/Tools';
import { VideoSection } from '~/components/sections/VideoSection';
import { WhatNext } from '~/components/sections/WhatNext';
import { routing } from '~/lib/i18n/routing';
import { loadSiteContent } from '~/lib/siteContent';

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const { newsItems, grants, publications, coreTeam } =
    await loadSiteContent(locale);

  return (
    <main className="relative isolate">
      <PageBackground />
      <div className="relative z-10">
        <HeroIntro newsItems={newsItems} />

        <Tools />
        <VideoSection />

        <DesignPrinciples />

        <Grants grants={grants} />
        <Publications publications={publications} />
        <CoreTeam members={coreTeam} />
        <ScientificAdvisors />
        <Institutions />
        <WhatNext />

        <Footer />
      </div>
    </main>
  );
}
