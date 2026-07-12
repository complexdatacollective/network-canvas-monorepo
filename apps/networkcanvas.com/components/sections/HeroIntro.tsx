'use client';

import { motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { BackgroundLights } from '@codaco/art';
import { Header } from '~/components/layout/Header';
import { Hero } from '~/components/sections/Hero';
import { createHeroEntrance } from '~/lib/heroEntrance';

const lightColors = [
  'oklch(var(--neon-coral))',
  'oklch(var(--sea-green))',
  'oklch(var(--cerulean-blue))',
  'oklch(var(--mustard))',
];

export function HeroIntro() {
  const reduceMotion = useReducedMotion();
  const entrance = createHeroEntrance(reduceMotion ?? true);
  const controls = useAnimationControls();
  const entranceStarted = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useLayoutEffect(() => {
    if (reduceMotion !== false || entranceStarted.current) {
      return;
    }

    entranceStarted.current = true;
    controls.set('hidden');
    void controls.start('visible');
  }, [controls, reduceMotion]);

  return (
    <div className="relative isolate overflow-hidden">
      {mounted ? (
        <div className="pointer-events-none absolute inset-0 z-0 opacity-20">
          <BackgroundLights
            large={1}
            medium={3}
            small={0}
            speedFactor={0.8}
            colors={lightColors}
          />
        </div>
      ) : null}
      <motion.div
        className="relative z-10"
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
