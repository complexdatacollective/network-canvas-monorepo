'use client';

import {
  motion,
  useAnimationControls,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useLayoutEffect, useRef } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Header } from '~/components/layout/Header';
import { HomepagePageBackground } from '~/components/ui/HomepagePageBackground';
import { cn } from '~/lib/cn';

import {
  HeroEntrance,
  launchHeroHeaderVariants,
  launchHeroWeaveVariants,
} from './HeroEntrance';
import { HeroSignalField } from './HeroSignalField';
import { Section } from './Section';

const heroTextGlowClasses =
  'bg-[conic-gradient(from_var(--text-glow-angle),var(--color-neon-coral),var(--color-sea-serpent),var(--color-mustard),var(--color-sea-green),var(--color-neon-coral))] bg-clip-text';

function renderHeroApps(chunks: ReactNode) {
  return (
    <span className="inline-block align-bottom">
      <HeroEntrance as="span" phase="apps" className="inline-block">
        {chunks}
      </HeroEntrance>
    </span>
  );
}

function HeroBrand({ children }: { children: ReactNode }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <span data-homepage-weave-target className="inline-block overflow-visible">
      <HeroEntrance
        as="span"
        phase="brand"
        className={cn(
          heroTextGlowClasses,
          'inline-block overflow-visible px-2 whitespace-nowrap text-white',
        )}
        style={{
          WebkitTextFillColor: 'var(--color-white)',
          WebkitTextStroke: 'var(--text-glow-stroke-width) transparent',
          paintOrder: 'stroke fill',
          textShadow:
            '0 0 0.025em var(--color-slate-blue-dark), 0 0 0.12em var(--color-slate-blue-dark), 0 0 0.28em var(--color-slate-blue)',
          animation: shouldReduceMotion
            ? undefined
            : 'var(--animate-text-glow)',
        }}
      >
        {children}
      </HeroEntrance>
    </span>
  );
}

function renderHeroBrand(chunks: ReactNode) {
  return <HeroBrand>{chunks}</HeroBrand>;
}

function renderHeroLead(chunks: ReactNode) {
  return (
    <span className="block">
      <HeroEntrance as="span" phase="lead" className="block origin-bottom">
        {chunks}
      </HeroEntrance>
    </span>
  );
}

function renderHeroProduct(chunks: ReactNode) {
  return <span className="block">{chunks}</span>;
}

function renderStrong(chunks: ReactNode) {
  return <strong>{chunks}</strong>;
}

export function LaunchHero() {
  const t = useTranslations('SummerUpdate.hero');
  const sectionRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const entranceControls = useAnimationControls();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 24,
    mass: 0.35,
  });
  const headingY = useTransform(smoothProgress, [0, 1], [0, -120]);
  const headingScale = useTransform(
    smoothProgress,
    [0, 0.62, 1],
    [1, 0.95, 0.86],
  );
  const headingOpacity = useTransform(
    smoothProgress,
    [0, 0.72, 1],
    [1, 0.92, 0],
  );
  const introductionY = useTransform(smoothProgress, [0, 1], [0, -56]);
  const introductionOpacity = useTransform(
    smoothProgress,
    [0, 0.58, 0.92],
    [1, 0.82, 0],
  );
  const scrollCueOpacity = useTransform(
    smoothProgress,
    [0, 0.18, 0.45],
    [1, 0.5, 0],
  );

  useLayoutEffect(() => {
    if (shouldReduceMotion === null) {
      return undefined;
    }

    if (shouldReduceMotion) {
      sectionRef.current?.removeAttribute('data-entrance-pending');
      return undefined;
    }

    entranceControls.set('hidden');
    sectionRef.current?.removeAttribute('data-entrance-pending');

    if (window.scrollY > 24) {
      entranceControls.set('visible');
      return undefined;
    }

    let active = true;
    const settleOnScroll = () => {
      if (window.scrollY <= 24) return;

      entranceControls.set('visible');
      window.removeEventListener('scroll', settleOnScroll);
    };

    window.addEventListener('scroll', settleOnScroll, { passive: true });
    void entranceControls.start('visible').finally(() => {
      if (active) window.removeEventListener('scroll', settleOnScroll);
    });

    return () => {
      active = false;
      entranceControls.stop();
      window.removeEventListener('scroll', settleOnScroll);
    };
  }, [entranceControls, shouldReduceMotion]);

  return (
    <Section
      ref={sectionRef}
      data-entrance-pending
      className="m-0! flex min-h-svh flex-col overflow-hidden px-0!"
      aria-labelledby="summer-update-title"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="from-slate-blue/25 via-sea-serpent/10 absolute inset-0 bg-linear-to-b to-transparent" />
        <motion.div
          className="entrance-motion-item absolute inset-0"
          initial={false}
          animate={entranceControls}
          variants={launchHeroWeaveVariants}
        >
          <HomepagePageBackground />
        </motion.div>
        <HeroSignalField />
      </div>
      <motion.div
        className="flex min-h-svh w-full flex-col"
        initial={false}
        animate={entranceControls}
      >
        <Header
          containerClassName="py-6!"
          entranceVariants={launchHeroHeaderVariants}
        />

        <div className="tablet-portrait:pt-24 tablet-portrait:pb-48 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-12 px-6 pt-16 pb-40 text-center">
          <motion.div
            className="w-full origin-center will-change-transform"
            style={
              shouldReduceMotion
                ? undefined
                : {
                    opacity: headingOpacity,
                    scale: headingScale,
                    y: headingY,
                  }
            }
          >
            <Heading
              level="h1"
              variant="display-heading"
              id="summer-update-title"
            >
              {t.rich('heading', {
                apps: renderHeroApps,
                brand: renderHeroBrand,
                lead: renderHeroLead,
                product: renderHeroProduct,
              })}
            </Heading>
          </motion.div>

          <HeroEntrance phase="copy">
            <motion.div
              className="will-change-transform"
              style={
                shouldReduceMotion
                  ? undefined
                  : {
                      opacity: introductionOpacity,
                      y: introductionY,
                    }
              }
            >
              <Paragraph
                intent="lead"
                className="tablet-landscape:text-xl text-center text-lg leading-relaxed"
              >
                {t.rich('description', {
                  strong: renderStrong,
                })}
              </Paragraph>
            </motion.div>
          </HeroEntrance>
        </div>

        <HeroEntrance
          phase="cue"
          className="absolute bottom-16 left-1/2 -translate-x-1/2"
        >
          <motion.div
            className="font-monospace flex flex-col items-center gap-3 text-center text-xs tracking-widest text-current/55 uppercase"
            style={
              shouldReduceMotion ? undefined : { opacity: scrollCueOpacity }
            }
          >
            <span className="text-pretty">{t('scrollCue')}</span>
            <span
              className="border-text/40 flex h-8 w-5 justify-center rounded-full border pt-2"
              aria-hidden
            >
              <span className="bg-text/70 size-1 rounded-full motion-safe:animate-bounce" />
            </span>
          </motion.div>
        </HeroEntrance>
      </motion.div>
    </Section>
  );
}
