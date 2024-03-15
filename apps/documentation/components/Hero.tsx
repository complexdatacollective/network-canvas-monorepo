'use client';

import { Paragraph, buttonVariants } from '@codaco/ui';
import { useTranslations } from 'next-intl';
import { Link } from '~/navigation';
import DocSearchComponent from './DocSearchComponent';
import { BackgroundBlobs } from '@codaco/art';
import { motion } from 'framer-motion';
import FancyHeading from './FancyHeading';

export function Hero() {
  const t = useTranslations();

  return (
    <div className="h-full overflow-hidden">
      <motion.div
        className="absolute inset-0 z-[-1] bg-gradient-to-br opacity-30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
      >
        <BackgroundBlobs large={3} medium={0} small={0} speedFactor={0.5} />
      </motion.div>
      <div className="py-16 sm:px-2 lg:relative lg:px-0 lg:py-20">
        <div className="mx-auto grid grid-cols-1 items-center gap-x-8 gap-y-16 px-4 lg:max-w-6xl lg:grid-cols-2 lg:px-8 xl:gap-x-16 xl:px-12">
          <div className="relative md:text-center lg:text-left">
            <div className="relative">
              <FancyHeading variant="h1" className="text-4xl">
                {t('Hero.title')}
              </FancyHeading>
              <Paragraph variant="lead" className="font-normal">
                {t('Hero.tagline')}
              </Paragraph>
              <div className="hidden pt-8 lg:block">
                <DocSearchComponent className="lg:w-3/4" />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-8 flex gap-4 md:justify-center lg:justify-start">
          <Link
            href="/desktop"
            className={buttonVariants({ variant: 'accent' })}
          >
            {t('ProjectSwitcher.desktop.label')}
          </Link>
          <Link
            href="/fresco"
            className={buttonVariants({ variant: 'secondary' })}
          >
            {t('ProjectSwitcher.fresco.label')}
          </Link>
        </div>
      </div>
    </div>
  );
}
