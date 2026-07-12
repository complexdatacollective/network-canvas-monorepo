'use client';

import { motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { useLayoutEffect, useRef } from 'react';

import { Header } from '~/components/layout/Header';
import { Hero } from '~/components/sections/Hero';
import { createHeroEntrance } from '~/lib/heroEntrance';

export function HeroIntro() {
  const reduceMotion = useReducedMotion();
  const entrance = createHeroEntrance(reduceMotion ?? true);
  const controls = useAnimationControls();
  const entranceStarted = useRef(false);

  useLayoutEffect(() => {
    if (reduceMotion !== false || entranceStarted.current) {
      return;
    }

    entranceStarted.current = true;
    controls.set('hidden');
    void controls.start('visible');
  }, [controls, reduceMotion]);

  return (
    <div className="tablet-portrait:min-h-svh relative isolate overflow-hidden">
      <motion.div
        className="tablet-portrait:flex tablet-portrait:min-h-svh tablet-portrait:flex-col relative z-10"
        variants={entrance.pageVariants}
        initial={false}
        animate={controls}
      >
        <Header entranceVariants={entrance.itemVariants} />
        <Hero
          containerVariants={entrance.heroVariants}
          itemVariants={entrance.itemVariants}
        />
      </motion.div>
    </div>
  );
}
