'use client';

import { ArrowRight } from 'lucide-react';
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
  return <strong className="text-text">{chunks}</strong>;
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
          variant="display-heading"
          margin="none"
          variants={itemVariants}
          className="entrance-motion-item text-text tablet-portrait:row-start-1 tablet-portrait:self-center mx-auto max-w-5xl text-center"
        >
          {t('headline')}
        </MotionHeading>

        <motion.div
          variants={itemVariants}
          data-testid="hero-media-row"
          className="entrance-motion-item tablet-portrait:row-start-2 tablet-portrait:mt-0 tablet-portrait:grid-cols-[1.1fr_0.9fr] tablet-portrait:gap-10 tablet-landscape:gap-16 mt-12 grid items-center gap-10"
        >
          <div
            data-testid="hero-media-sizer"
            className="tablet-portrait:max-w-[min(100%,48svh)] tablet-portrait:justify-self-center w-full"
          >
            <HeroVideo />
          </div>
          <Paragraph
            margin="none"
            className="text-text tablet-portrait:text-left tablet-landscape:text-xl text-center text-lg leading-relaxed"
          >
            {t.rich('description', { strong: renderStrong })}
          </Paragraph>
        </motion.div>

        <motion.div
          variants={itemVariants}
          data-testid="hero-news-wrapper"
          className="entrance-motion-item tablet-portrait:col-start-1 tablet-portrait:row-start-3 tablet-portrait:mt-0 tablet-portrait:min-w-0 mt-12"
        >
          <NewsTicker newsItems={newsItems} />
        </motion.div>

        <motion.div
          variants={itemVariants}
          data-testid="hero-cta-wrapper"
          className="entrance-motion-item tablet-portrait:col-start-1 tablet-portrait:row-start-4 tablet-portrait:mt-0 mt-12 flex flex-col items-center gap-3"
        >
          <ButtonLink
            href={GET_STARTED_PATH}
            color="default"
            size="lg"
            className="bg-neon-coral tablet-landscape:h-16 tablet-landscape:px-10 tablet-landscape:text-xl rounded-full text-white"
          >
            {t('getStarted')}
            <ArrowRight
              aria-hidden
              className="tablet-landscape:size-6 size-5"
            />
          </ButtonLink>
          <Paragraph margin="none" className="text-base-sm text-text/60">
            {t('keepScrolling')}
          </Paragraph>
        </motion.div>
      </Container>
    </motion.div>
  );
}
