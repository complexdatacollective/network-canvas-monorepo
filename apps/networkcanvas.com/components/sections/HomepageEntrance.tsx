'use client';

import { type ReactNode, useCallback, useState } from 'react';

import { HomepagePageBackground } from '~/components/ui/HomepagePageBackground';
import type { NewsItem } from '~/lib/siteContent';

import { HeroIntro } from './HeroIntro';

type HomepageEntranceProps = {
  children: ReactNode;
  newsItems: readonly NewsItem[];
};

export function HomepageEntrance({
  children,
  newsItems,
}: HomepageEntranceProps) {
  const [revealBackground, setRevealBackground] = useState(false);
  const handleEntranceStart = useCallback(() => {
    setRevealBackground(true);
  }, []);

  return (
    <>
      <HomepagePageBackground reveal={revealBackground} />
      <div className="relative z-10">
        <HeroIntro
          newsItems={newsItems}
          onEntranceStart={handleEntranceStart}
        />
        {children}
      </div>
    </>
  );
}
