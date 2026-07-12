import { Footer } from '~/components/layout/Footer';
import { Contractors } from '~/components/sections/Contractors';
import { CoreTeam } from '~/components/sections/CoreTeam';
import { DesignPrinciples } from '~/components/sections/DesignPrinciples';
import { Grants } from '~/components/sections/Grants';
import { HeroIntro } from '~/components/sections/HeroIntro';
import { Institutions } from '~/components/sections/Institutions';
import { Projects } from '~/components/sections/Projects';
import { Publications } from '~/components/sections/Publications';
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

        <Projects />
        <Grants />
        <Publications />
        <CoreTeam />
        <Contractors />
        <Institutions />
        <WhatNext />

        <Footer />
      </div>
    </main>
  );
}
