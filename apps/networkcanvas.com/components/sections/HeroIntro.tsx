'use client';

import { motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { useLayoutEffect, useRef } from 'react';

import { Header } from '~/components/layout/Header';
import { Hero } from '~/components/sections/Hero';
import { createHeroEntrance } from '~/lib/heroEntrance';
import type { NewsItem } from '~/lib/siteContent';

type HeroIntroProps = {
  newsItems: readonly NewsItem[];
  onEntranceStart: () => void;
};

export function HeroIntro({ newsItems, onEntranceStart }: HeroIntroProps) {
  const reduceMotion = useReducedMotion();
  const entrance = createHeroEntrance(reduceMotion ?? true);
  const controls = useAnimationControls();
  const entranceStarted = useRef(false);
  const introRef = useRef<HTMLDivElement>(null);

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
    <div
      ref={introRef}
      data-entrance-pending
      className="tablet-portrait:min-h-svh relative isolate overflow-hidden"
    >
      <motion.div
        className="tablet-portrait:flex tablet-portrait:min-h-svh tablet-portrait:flex-col relative z-10"
        variants={entrance.pageVariants}
        initial={false}
        animate={controls}
      >
        <Header activeItemId="home" entranceVariants={entrance.itemVariants} />
        <Hero
          containerVariants={entrance.heroVariants}
          itemVariants={entrance.itemVariants}
          newsItems={newsItems}
        />
      </motion.div>
    </div>
  );
}
