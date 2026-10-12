'use client';

import { motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { type ReactNode, useLayoutEffect, useRef } from 'react';

import { SITE_NAVIGATION_SKIP_TARGET_ID } from '@codaco/fresco-ui/navigation/SiteNavigation.constants';
import { Header } from '~/components/layout/Header';
import { HeroPageLayout } from '~/components/layout/HeroPageLayout';
import { Hero } from '~/components/sections/Hero';
import { useHeroScrollDeparture } from '~/components/ui/useHeroScrollDeparture';
import { createHeroEntrance } from '~/lib/heroEntrance';
import type { NewsItem } from '~/lib/siteContent';

type HeroIntroProps = {
  // The rest of the page's main content, after the hero.
  children?: ReactNode;
  newsItems: readonly NewsItem[];
  onEntranceStart: () => void;
};

export function HeroIntro({
  children,
  newsItems,
  onEntranceStart,
}: HeroIntroProps) {
  const reduceMotion = useReducedMotion();
  const entrance = createHeroEntrance(reduceMotion ?? true);
  const controls = useAnimationControls();
  const entranceStarted = useRef(false);
  const introRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const heroScrollStyle = useHeroScrollDeparture(frameRef);

  useLayoutEffect(() => {
    if (reduceMotion === null || entranceStarted.current) {
      return;
    }

    entranceStarted.current = true;
    if (reduceMotion) {
      onEntranceStart();
      return;
    }

    controls.set('hidden');
    onEntranceStart();
    introRef.current?.removeAttribute('data-entrance-pending');
    void controls.start('visible');
  }, [controls, onEntranceStart, reduceMotion]);

  return (
    <HeroPageLayout
      ref={introRef}
      frameRef={frameRef}
      entrancePending
      fillScreen="tablet-portrait"
      header={
        <motion.div initial={false} animate={controls}>
          <Header
            activeItemId="home"
            entranceVariants={entrance.itemVariants}
          />
        </motion.div>
      }
      hero={
        <motion.div
          initial={false}
          animate={controls}
          className="tablet-portrait:flex tablet-portrait:flex-col relative isolate overflow-hidden"
        >
          <Hero
            id={SITE_NAVIGATION_SKIP_TARGET_ID}
            backdropItemVariants={entrance.backdropItemVariants}
            containerVariants={entrance.heroVariants}
            itemVariants={entrance.itemVariants}
            newsItems={newsItems}
            scrollStyle={heroScrollStyle}
          />
        </motion.div>
      }
    >
      {children}
    </HeroPageLayout>
  );
}
