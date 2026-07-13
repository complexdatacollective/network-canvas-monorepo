'use client';

import { motion } from 'motion/react';
import type { Variants } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { NewsTicker } from '~/components/sections/NewsTicker';
import { ButtonLink } from '~/components/ui/ButtonLink';
import { Container } from '~/components/ui/Container';
import { HeroVideo } from '~/components/ui/HeroVideo';
import { GET_STARTED_PATH } from '~/lib/getStarted';
import type { NewsItem } from '~/lib/siteContent';

const MotionHeading = motion.create(Heading);

function renderStrong(chunks: ReactNode) {
  return <strong className="text-cyber-grape">{chunks}</strong>;
}

export function Hero({
  containerVariants,
  itemVariants,
  newsItems,
}: {
  containerVariants?: Variants;
  itemVariants?: Variants;
  newsItems: readonly NewsItem[];
}) {
  const t = useTranslations('Hero');

  return (
    <motion.div
      variants={containerVariants}
      data-testid="hero-root"
      className="tablet-portrait:flex tablet-portrait:flex-1"
    >
      <Container
        data-testid="hero-layout"
        className="tablet-portrait:grid tablet-portrait:flex-1 tablet-portrait:grid-cols-1 tablet-portrait:grid-rows-[minmax(auto,20svh)_auto_auto_auto] tablet-portrait:items-center tablet-portrait:content-center tablet-portrait:gap-y-10 tablet-portrait:pt-4 tablet-portrait:pb-6 pt-6 pb-20"
      >
        <MotionHeading
          level="h1"
          margin="none"
          variants={itemVariants}
          className="font-heading text-cyber-grape tablet-portrait:row-start-1 tablet-portrait:self-center tablet-portrait:text-[4rem] tablet-portrait:leading-[1.04] tablet-landscape:text-[4.5rem] tablet-landscape:leading-[1.02] desktop:text-[5rem] mx-auto max-w-5xl text-center text-4xl font-black"
        >
          {t('headline')}
        </MotionHeading>

        <motion.div
          variants={itemVariants}
          data-testid="hero-media-row"
          className="tablet-portrait:row-start-2 tablet-portrait:mt-0 tablet-portrait:grid-cols-[1.1fr_0.9fr] tablet-portrait:gap-10 tablet-landscape:gap-16 mt-12 grid items-center gap-10"
        >
          <div
            data-testid="hero-media-sizer"
            className="tablet-portrait:max-w-[min(100%,48svh)] tablet-portrait:justify-self-center w-full"
          >
            <HeroVideo />
          </div>
          <Paragraph
            margin="none"
            className="text-cyber-grape tablet-portrait:text-left tablet-landscape:text-xl text-center text-lg leading-relaxed"
          >
            {t.rich('description', { strong: renderStrong })}
          </Paragraph>
        </motion.div>

        <motion.div
          variants={itemVariants}
          data-testid="hero-news-wrapper"
          className="tablet-portrait:col-start-1 tablet-portrait:row-start-3 tablet-portrait:mt-0 tablet-portrait:min-w-0 mt-12"
        >
          <NewsTicker newsItems={newsItems} />
        </motion.div>

        <motion.div
          variants={itemVariants}
          data-testid="hero-cta-wrapper"
          className="tablet-portrait:col-start-1 tablet-portrait:row-start-4 tablet-portrait:mt-0 mt-12 flex flex-col items-center gap-3"
        >
          <ButtonLink
            href={GET_STARTED_PATH}
            color="default"
            size="lg"
            className="bg-neon-coral rounded-full text-white"
          >
            {t('getStarted')}
          </ButtonLink>
          <Paragraph margin="none" className="text-base-sm text-text/60">
            {t('keepScrolling')}
          </Paragraph>
        </motion.div>
      </Container>
    </motion.div>
  );
}
