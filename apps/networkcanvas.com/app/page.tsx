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
import { Blob } from '~/components/ui/Blob';

export default function HomePage() {
  return (
    <main>
      <HeroIntro />

      <Tools />
      <VideoSection />

      <div className="relative overflow-hidden">
        <Blob
          src="/images/blobs/multi-2.svg"
          className="top-20 -left-24 w-[26rem]"
        />
        <DesignPrinciples />
      </div>

      <Projects />
      <Grants />
      <Publications />
      <CoreTeam />
      <Contractors />
      <Institutions />
      <WhatNext />

      <Footer />
    </main>
  );
}
