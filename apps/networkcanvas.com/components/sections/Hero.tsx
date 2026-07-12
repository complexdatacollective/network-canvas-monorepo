'use client';

import { motion } from 'motion/react';
import type { Variants } from 'motion/react';

import { NewsTicker } from '~/components/sections/NewsTicker';
import { Container } from '~/components/ui/Container';
import { HeroVideo } from '~/components/ui/HeroVideo';
import { PillLink } from '~/components/ui/PillLink';
import { GET_STARTED_PATH } from '~/lib/getStarted';

export function Hero({
  containerVariants,
  itemVariants,
}: {
  containerVariants?: Variants;
  itemVariants?: Variants;
}) {
  return (
    <motion.div
      variants={containerVariants}
      className="tablet-portrait:flex tablet-portrait:flex-1"
    >
      <Container className="tablet-portrait:grid tablet-portrait:flex-1 tablet-portrait:grid-cols-1 tablet-portrait:grid-rows-[minmax(auto,20svh)_auto_auto_auto] tablet-portrait:items-center tablet-portrait:content-center tablet-portrait:gap-y-10 tablet-portrait:pt-4 tablet-portrait:pb-6 pt-6 pb-20">
        <motion.h1
          variants={itemVariants}
          className="font-heading text-cyber-grape tablet-portrait:row-start-1 tablet-portrait:self-center tablet-portrait:text-[4rem] tablet-portrait:leading-[1.04] tablet-landscape:text-[4.5rem] tablet-landscape:leading-[1.02] desktop:text-[5rem] mx-auto max-w-5xl text-center text-4xl font-black"
        >
          Simplifying complex network data collection.
        </motion.h1>

        <motion.div
          variants={itemVariants}
          className="tablet-portrait:row-start-2 tablet-portrait:mt-0 tablet-portrait:grid-cols-[1.1fr_0.9fr] tablet-portrait:gap-10 tablet-landscape:gap-16 mt-12 grid items-center gap-10"
        >
          <div className="tablet-portrait:max-w-[min(100%,48svh)] tablet-portrait:justify-self-center w-full">
            <HeroVideo />
          </div>
          <p className="text-cyber-grape tablet-portrait:text-left tablet-landscape:text-xl text-center text-lg leading-relaxed">
            Network Canvas provides{' '}
            <strong className="text-cyber-grape">free and open-source</strong>{' '}
            software for surveying networks, designed around the needs of both
            researchers and their participants.
          </p>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="tablet-portrait:col-start-1 tablet-portrait:row-start-3 tablet-portrait:mt-0 tablet-portrait:min-w-0 mt-12"
        >
          <NewsTicker />
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="tablet-portrait:col-start-1 tablet-portrait:row-start-4 tablet-portrait:mt-0 mt-12 flex flex-col items-center gap-3"
        >
          <PillLink href={GET_STARTED_PATH} tone="neon-coral" size="lg">
            Get Started
          </PillLink>
          <p className="text-base-sm text-text/60">
            or keep scrolling to learn more
          </p>
        </motion.div>
      </Container>
    </motion.div>
  );
}
