'use client';

import { ArrowDownRight } from 'lucide-react';
import { motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import { Header } from '~/components/layout/Header';
import { Container } from '~/components/ui/Container';
import { externalLinks } from '~/lib/content';
import { createHeroEntrance } from '~/lib/heroEntrance';

type StartingPath = {
  id: 'design' | 'collect' | 'learn';
  href: string;
  accent: 'bg-neon-coral' | 'bg-cerulean-blue' | 'bg-sea-green';
  external?: boolean;
};

const startingPaths: readonly StartingPath[] = [
  {
    id: 'learn',
    href: externalLinks.documentation,
    accent: 'bg-sea-green',
    external: true,
  },
  {
    id: 'design',
    href: '#design',
    accent: 'bg-neon-coral',
  },
  {
    id: 'collect',
    href: '#collect',
    accent: 'bg-cerulean-blue',
  },
];

export function GetStartedIntro() {
  const t = useTranslations('GetStarted');
  const reduceMotion = useReducedMotion();
  const entrance = createHeroEntrance(reduceMotion ?? true);
  const controls = useAnimationControls();
  const entranceStarted = useRef(false);
  const introRef = useRef<HTMLDivElement>(null);

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
        className="relative z-10"
        variants={entrance.pageVariants}
        initial={false}
        animate={controls}
      >
        <Header
          activeItemId="getStarted"
          entranceVariants={entrance.itemVariants}
        />

        <motion.div
          variants={entrance.heroVariants}
          className="tablet-portrait:pt-24 tablet-portrait:pb-32 pt-16 pb-24"
        >
          <motion.div
            variants={entrance.itemVariants}
            className="entrance-motion-item mx-auto max-w-4xl px-6 text-center"
          >
            <Heading
              level="h1"
              margin="none"
              className="font-heading text-text text-4xl font-black tracking-tight text-balance"
            >
              {t('intro.heading')}
            </Heading>
          </motion.div>

          <Container
            maxWidth="wide"
            className="tablet-portrait:grid-cols-2 tablet-landscape:grid-cols-3 mt-14 grid gap-6"
          >
            {startingPaths.map((stage) => (
              <motion.a
                key={stage.href}
                href={stage.href}
                target={stage.external ? '_blank' : undefined}
                rel={stage.external ? 'noreferrer' : undefined}
                aria-label={t(`intro.stages.${stage.id}.accessibleName`)}
                variants={entrance.itemVariants}
                whileHover={reduceMotion ? undefined : { y: -5 }}
                whileFocus={reduceMotion ? undefined : { y: -5 }}
                className="entrance-motion-item focusable elevation-medium group tablet-portrait:last:col-span-2 tablet-landscape:last:col-span-1 tablet-portrait:p-10 bg-surface/55 flex min-h-64 flex-col justify-between rounded p-8 backdrop-blur-md"
              >
                <span className="font-heading text-text/65 text-xs font-bold tracking-[0.14em] uppercase">
                  {t(`intro.stages.${stage.id}.label`)}
                </span>
                <span className="mt-12 flex items-end justify-between gap-6">
                  <span className="font-heading text-text tablet-portrait:text-3xl max-w-lg text-2xl font-black tracking-tight text-balance">
                    {t(`intro.stages.${stage.id}.title`)}
                  </span>
                  <span
                    className={`${stage.accent} flex size-12 shrink-0 items-center justify-center rounded-full text-white transition-transform group-hover:translate-x-1 group-hover:translate-y-1 group-focus-visible:translate-x-1 group-focus-visible:translate-y-1 motion-reduce:transform-none`}
                  >
                    <ArrowDownRight aria-hidden className="size-6" />
                  </span>
                </span>
              </motion.a>
            ))}
          </Container>
        </motion.div>
      </motion.div>
    </div>
  );
}
