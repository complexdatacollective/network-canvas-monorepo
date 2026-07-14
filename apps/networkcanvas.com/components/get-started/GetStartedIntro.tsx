'use client';

import { ArrowDownRight } from 'lucide-react';
import { motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Header } from '~/components/layout/Header';
import { Container } from '~/components/ui/Container';
import { createHeroEntrance } from '~/lib/heroEntrance';

type ResearchStage = {
  id: 'design' | 'collect';
  href: '#design' | '#collect';
  accent: 'bg-neon-coral' | 'bg-cerulean-blue';
};

const researchStages: readonly ResearchStage[] = [
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

  useLayoutEffect(() => {
    if (reduceMotion !== false || entranceStarted.current) {
      return;
    }

    entranceStarted.current = true;
    controls.set('hidden');
    void controls.start('visible');
  }, [controls, reduceMotion]);

  return (
    <div className="relative isolate overflow-hidden">
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
            className="mx-auto max-w-4xl px-6 text-center"
          >
            <Paragraph
              margin="none"
              className="font-heading text-neon-coral text-sm font-bold tracking-[0.16em] uppercase"
            >
              {t('intro.eyebrow')}
            </Paragraph>
            <Heading
              level="h1"
              margin="none"
              className="font-heading text-text mt-5! text-4xl font-black tracking-tight text-balance"
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

          <Container className="tablet-portrait:grid-cols-2 mt-14 grid gap-6">
            {researchStages.map((stage) => (
              <motion.a
                key={stage.href}
                href={stage.href}
                aria-label={t(`intro.stages.${stage.id}.accessibleName`)}
                variants={entrance.itemVariants}
                whileHover={reduceMotion ? undefined : { y: -5 }}
                whileFocus={reduceMotion ? undefined : { y: -5 }}
                className="focusable elevation-medium group tablet-portrait:p-10 bg-surface/55 flex min-h-64 flex-col justify-between rounded p-8 backdrop-blur-md"
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
