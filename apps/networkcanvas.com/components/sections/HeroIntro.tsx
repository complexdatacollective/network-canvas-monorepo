'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

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
  const reduceMotion = useReducedMotion() ?? false;
  const entrance = createHeroEntrance(reduceMotion);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

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
        initial={entrance.initial}
        animate="visible"
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
