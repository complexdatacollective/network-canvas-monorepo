'use client';

import { useTranslations } from 'next-intl';
import { Link } from '~/navigation';
import DocSearchComponent from './DocSearchComponent';
import FancyHeading from './FancyHeading';
import FancyParagraph from './FancyParagraph';
import { motion } from 'framer-motion';
import { Paragraph } from '@codaco/ui';

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
        className="flex h-full flex-1 basis-1/2 flex-col gap-2 rounded-xl border border-border bg-card p-6 shadow-xl shadow-platinum-dark/40"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
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

  return (
    <>
      <motion.div
        className="z-10 m-4 flex max-w-5xl flex-1 flex-col items-center justify-center gap-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="flex flex-col-reverse md:flex-row">
          <div className="flex flex-col items-center justify-center md:basis-3/5">
            <FancyHeading variant="h1" className="text-4xl">
              {t('Hero.title')}
            </FancyHeading>
            <FancyParagraph variant="lead">{t('Hero.tagline')}</FancyParagraph>
            <DocSearchComponent className="!w-full text-base" large />
          </div>
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
