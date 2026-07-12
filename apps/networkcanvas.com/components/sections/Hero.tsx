'use client';

import { motion } from 'motion/react';
import type { Variants } from 'motion/react';

import { NewsTicker } from '~/components/sections/NewsTicker';
import { Container } from '~/components/ui/Container';
import { HeroVideo } from '~/components/ui/HeroVideo';
import { PillLink } from '~/components/ui/PillLink';

export function Hero({
  containerVariants,
  itemVariants,
}: {
  containerVariants?: Variants;
  itemVariants?: Variants;
}) {
  return (
    <motion.div variants={containerVariants}>
      <Container className="tablet-landscape:pb-28 pt-6 pb-20">
        <motion.h1
          variants={itemVariants}
          className="font-heading text-cyber-grape tablet-portrait:text-[4rem] tablet-portrait:leading-[1.04] tablet-landscape:text-[4.5rem] tablet-landscape:leading-[1.02] desktop:text-[5rem] mx-auto max-w-5xl text-center text-4xl font-black"
        >
          Simplifying complex network data collection.
        </motion.h1>

        <motion.div
          variants={itemVariants}
          className="tablet-landscape:mt-16 tablet-landscape:grid-cols-[1.1fr_0.9fr] tablet-landscape:gap-16 mt-12 grid items-center gap-10"
        >
          <HeroVideo />
          <p className="text-cyber-grape tablet-landscape:text-left tablet-landscape:text-xl text-center text-lg leading-relaxed">
            Network Canvas provides{' '}
            <strong className="text-cyber-grape">free and open-source</strong>{' '}
            software for surveying networks, designed around the needs of both
            researchers and their participants.
          </p>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="tablet-landscape:mt-16 mt-12"
        >
          <NewsTicker />
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="mt-12 flex flex-col items-center gap-3"
        >
          <PillLink href="/download" tone="neon-coral" size="lg">
            Download Now
          </PillLink>
          <p className="text-base-sm text-text/60">
            or keep scrolling to learn more
          </p>
        </motion.div>
      </Container>
    </motion.div>
  );
}
