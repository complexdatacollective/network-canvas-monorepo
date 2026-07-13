'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import WorkflowNav from '~/components/WorkflowNav';

import DocSearchComponent from './DocSearchComponent';
import FancyHeading from './FancyHeading';
import FancyParagraph from './FancyParagraph';

export function Hero() {
  const t = useTranslations();

  return (
    <motion.div
      className="phone-landscape:mx-8 tablet-portrait:flex-1 tablet-portrait:pt-3 tablet-landscape:gap-16 mx-4 flex max-w-7xl flex-col items-center justify-center gap-10 pt-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="tablet-portrait:items-start flex w-full flex-col items-center justify-center">
        <FancyHeading
          level="h1"
          className="font-heading tablet-portrait:mx-0 tablet-portrait:text-left tablet-portrait:text-[4rem] tablet-portrait:leading-[1.04] tablet-landscape:text-[4.5rem] tablet-landscape:leading-[1.02] desktop:text-[5rem] mx-auto max-w-5xl text-center text-4xl font-black"
        >
          {t('Hero.title')}
        </FancyHeading>
        <FancyParagraph
          intent="lead"
          margin="none"
          className="tablet-portrait:text-left tablet-landscape:text-xl max-w-2xl text-center text-lg leading-relaxed"
        >
          {t('Hero.tagline')}
        </FancyParagraph>
        <DocSearchComponent
          className="tablet-landscape:inline-flex mt-4 hidden !w-full max-w-2xl rounded-3xl text-base"
          large
        />
      </div>
      <WorkflowNav variant="full" />
    </motion.div>
  );
}
