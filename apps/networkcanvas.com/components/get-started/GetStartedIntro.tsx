'use client';

import { ArrowDownRight } from 'lucide-react';
import { motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef } from 'react';

import { Badge, type BadgeColor } from '@codaco/fresco-ui/Badge';
import { SITE_NAVIGATION_SKIP_TARGET_ID } from '@codaco/fresco-ui/navigation/SiteNavigation.constants';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Header } from '~/components/layout/Header';
import { Container } from '~/components/ui/Container';
import { useHeroScrollDeparture } from '~/components/ui/useHeroScrollDeparture';
import { externalLinks } from '~/lib/content';
import { createHeroEntrance } from '~/lib/heroEntrance';

type StartingPath = {
  id: 'design' | 'collect' | 'learn';
  href: string;
  accent: Extract<BadgeColor, 'neon-coral' | 'cerulean-blue' | 'sea-green'>;
  external?: boolean;
};

const ACCENT_DISC: Record<StartingPath['accent'], string> = {
  'sea-green': 'bg-sea-green',
  'neon-coral': 'bg-neon-coral',
  'cerulean-blue': 'bg-cerulean-blue',
};

const startingPaths: readonly StartingPath[] = [
  {
    id: 'learn',
    href: externalLinks.documentation,
    accent: 'sea-green',
    external: true,
  },
  {
    id: 'design',
    href: '#design',
    accent: 'neon-coral',
  },
  {
    id: 'collect',
    href: '#collect',
    accent: 'cerulean-blue',
  },
];

export function GetStartedIntro() {
  const t = useTranslations('GetStarted');
  const reduceMotion = useReducedMotion();
  const entrance = createHeroEntrance(reduceMotion ?? true);
  const controls = useAnimationControls();
  const entranceStarted = useRef(false);
  const introRef = useRef<HTMLDivElement>(null);
  const heroScrollStyle = useHeroScrollDeparture(introRef, {
    distance: 80,
    restingScale: 0.95,
  });

  useLayoutEffect(() => {
    if (reduceMotion !== false || entranceStarted.current) {
      return;
    }

    entranceStarted.current = true;
    controls.set('hidden');
    introRef.current?.removeAttribute('data-entrance-pending');
    void controls.start('visible');
  }, [controls, reduceMotion]);

  return (
    <div
      ref={introRef}
      data-entrance-pending
      className="relative isolate overflow-hidden"
    >
      <motion.div
        variants={entrance.pageVariants}
        initial={false}
        animate={controls}
      >
        <Header
          activeItemId="getStarted"
          entranceVariants={entrance.itemVariants}
        />

        <motion.div
          id={SITE_NAVIGATION_SKIP_TARGET_ID}
          variants={entrance.heroVariants}
          style={heroScrollStyle}
          className="tablet-portrait:pt-24 tablet-portrait:pb-32 origin-center pt-16 pb-24 will-change-transform"
        >
          <motion.div
            variants={entrance.itemVariants}
            data-get-started-weave-target
            className="entrance-motion-item mx-auto max-w-4xl px-6 text-center"
          >
            <Heading
              level="h1"
              variant="display-heading"
              margin="none"
              className="text-text"
            >
              {t('intro.heading')}
            </Heading>
            <Paragraph
              intent="lead"
              margin="none"
              className="text-text/75 mx-auto mt-6 max-w-2xl text-lg text-pretty"
            >
              {t('intro.introduction')}
            </Paragraph>
          </motion.div>

          <Container
            maxWidth="wide"
            data-get-started-weave-target
            className="tablet-portrait:grid-cols-2 tablet-landscape:grid-cols-3 mt-14 grid gap-6"
          >
            {startingPaths.map((stage) => (
              <motion.a
                key={stage.href}
                href={stage.href}
                target={stage.external ? '_blank' : undefined}
                rel={stage.external ? 'noreferrer' : undefined}
                aria-label={t(`intro.stages.${stage.id}.accessibleName`)}
                data-get-started-weave-interactive-target
                variants={entrance.backdropItemVariants}
                whileHover={reduceMotion ? undefined : { y: -5 }}
                whileFocus={reduceMotion ? undefined : { y: -5 }}
                className="entrance-motion-item focusable elevation-medium group tablet-portrait:last:col-span-2 tablet-landscape:last:col-span-1 tablet-portrait:p-10 tablet-portrait:pb-28 bg-surface/55 relative min-h-64 rounded p-8 pb-24 backdrop-blur-md"
              >
                <Badge mono uppercase appearance="soft" color={stage.accent}>
                  {t(`intro.stages.${stage.id}.label`)}
                </Badge>
                <span className="font-heading text-text tablet-portrait:text-2xl mt-8 block max-w-lg text-xl font-black tracking-tight text-balance">
                  {t(`intro.stages.${stage.id}.title`)}
                </span>
                <span
                  className={`${ACCENT_DISC[stage.accent]} tablet-portrait:right-10 tablet-portrait:bottom-10 absolute right-8 bottom-8 flex size-12 items-center justify-center rounded-full text-white transition-transform group-hover:translate-x-1 group-hover:translate-y-1 group-focus-visible:translate-x-1 group-focus-visible:translate-y-1 motion-reduce:transform-none`}
                >
                  <ArrowDownRight aria-hidden className="size-6" />
                </span>
              </motion.a>
            ))}
          </Container>
        </motion.div>
      </motion.div>
    </div>
  );
}
