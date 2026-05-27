import { Footer } from '~/components/layout/Footer';
import { Header } from '~/components/layout/Header';
import { Contractors } from '~/components/sections/Contractors';
import { CoreTeam } from '~/components/sections/CoreTeam';
import { DesignPrinciples } from '~/components/sections/DesignPrinciples';
import { Grants } from '~/components/sections/Grants';
import { Hero } from '~/components/sections/Hero';
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
      <div className="relative overflow-hidden">
        <Blob
          src="/images/blobs/coral-2.svg"
          className="top-10 -left-32 w-[36rem]"
        />
        <Blob
          src="/images/blobs/yellow-1.svg"
          className="top-0 -right-24 w-[34rem]"
        />
        <Blob
          src="/images/blobs/multi-1.svg"
          className="top-[34rem] -left-20 w-[28rem]"
        />
        <Header />
        <Hero />
      </div>

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
