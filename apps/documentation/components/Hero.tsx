'use client';

import { useTranslations } from 'next-intl';
import { Link } from '~/navigation';
import DocSearchComponent from './DocSearchComponent';
import FancyHeading from './FancyHeading';
import FancyParagraph from './FancyParagraph';
import { motion } from 'framer-motion';
import { Paragraph } from '@codaco/ui';
import { cn } from '~/lib/utils';
import { useTheme } from 'next-themes';

function ProjectCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <Link href={href} className="basis-1/2">
      <motion.div
        className={cn(
          'flex h-full cursor-pointer flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-xl transition-colors md:p-6',
          'hover:border-accent hover:bg-accent hover:text-accent-foreground',
        )}
      >
        <div className="flex shrink-0 items-center gap-4">
          <img src={icon} className="h-16 w-auto" alt={title} />
          <FancyHeading variant="h2">{title}</FancyHeading>
        </div>
        <Paragraph>{description}</Paragraph>
      </motion.div>
    </Link>
  );
}

export function Hero() {
  const t = useTranslations();
  const { resolvedTheme } = useTheme();

  return (
    <>
      <motion.div
        className="m-4 flex max-w-5xl flex-col items-center gap-10 sm:m-8 md:-mt-8 md:flex-1 md:justify-center lg:gap-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="flex flex-col-reverse md:flex-row">
          <div className="flex flex-col items-center justify-center md:basis-3/5">
            <FancyHeading variant="h1" className="text-4xl">
              {t('Hero.title')}
            </FancyHeading>
            <FancyParagraph variant="lead">{t('Hero.tagline')}</FancyParagraph>
            <DocSearchComponent
              className="hidden !w-full text-base lg:inline-flex"
              large
            />
          </div>
          {resolvedTheme !== 'dark' && (
            <div className="hidden shrink-0 items-center justify-center md:flex md:basis-2/5">
              <motion.div
                initial={{ opacity: 0, y: 200, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 80,
                  delay: 0.25,
                }}
              >
                <img
                  src="images/robot.svg"
                  className="h-auto w-full"
                  alt="Robot"
                />
              </motion.div>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-6 md:flex-row">
          <ProjectCard
            href="en/desktop"
            title={t('ProjectSwitcher.desktop.label')}
            description={t('ProjectSwitcher.desktop.description')}
            icon="images/desktop.png"
          />
          <ProjectCard
            href="en/fresco"
            title={t('ProjectSwitcher.fresco.label')}
            description={t('ProjectSwitcher.fresco.description')}
            icon="images/fresco.png"
          />
        </div>
      </motion.div>
    </>
  );
}
