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
import { PageBackground } from '~/components/ui/PageBackground';

export default function HomePage() {
  return (
    <main className="homepage-body relative isolate">
      <PageBackground />
      <div className="relative z-10">
        <HeroIntro />

        <Tools />
        <VideoSection />

        <DesignPrinciples />

        <Grants />
        <Publications />
        <CoreTeam />
        <ScientificAdvisors />
        <Institutions />
        <WhatNext />

        <Footer />
      </div>
    </main>
  );
}
