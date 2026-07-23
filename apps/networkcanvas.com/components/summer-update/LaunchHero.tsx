'use client';

import {
  motion,
  useAnimationControls,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import { useLayoutEffect, useRef } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Header } from '~/components/layout/Header';
import { HomepagePageBackground } from '~/components/ui/HomepagePageBackground';
import { cn } from '~/lib/cn';

import { HeroEntrance, launchHeroHeaderVariants } from './HeroEntrance';
import { HeroSignalField } from './HeroSignalField';
import { Section } from './Section';

const heroTextGlowClasses =
  'bg-[conic-gradient(from_var(--text-glow-angle),var(--color-neon-coral),var(--color-sea-serpent),var(--color-mustard),var(--color-sea-green),var(--color-neon-coral))] bg-clip-text';

export function LaunchHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const entranceStarted = useRef(false);
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
    if (shouldReduceMotion === null || entranceStarted.current) {
      return undefined;
    }

    entranceStarted.current = true;
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
        <HomepagePageBackground />
        <HeroSignalField />
      </div>
      <motion.div
        className="relative z-10 flex min-h-svh w-full flex-col"
        initial={false}
        animate={entranceControls}
      >
        <Header
          className="relative z-20"
          containerClassName="py-6!"
          entranceVariants={launchHeroHeaderVariants}
        />

        <div className="tablet-portrait:pt-24 tablet-portrait:pb-48 relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-12 px-6 pt-16 pb-40 text-center">
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
              <span className="block overflow-hidden">
                <HeroEntrance as="span" phase="lead" className="block">
                  Introducing the next generation of
                </HeroEntrance>
              </span>{' '}
              <span className="block">
                <span
                  data-homepage-weave-target
                  className="relative inline-block overflow-visible"
                >
                  <HeroEntrance
                    as="span"
                    phase="brand"
                    className={cn(
                      heroTextGlowClasses,
                      'relative inline-block overflow-visible px-2 whitespace-nowrap text-white',
                    )}
                    style={{
                      WebkitTextFillColor: 'var(--color-white)',
                      WebkitTextStroke:
                        'var(--text-glow-stroke-width) transparent',
                      paintOrder: 'stroke fill',
                      textShadow:
                        '0 0 0.025em var(--color-slate-blue-dark), 0 0 0.12em var(--color-slate-blue-dark), 0 0 0.28em var(--color-slate-blue)',
                      animation: shouldReduceMotion
                        ? undefined
                        : 'var(--animate-text-glow)',
                    }}
                  >
                    Network Canvas
                  </HeroEntrance>
                </span>{' '}
                <span className="inline-block overflow-hidden align-bottom">
                  <HeroEntrance as="span" phase="apps" className="inline-block">
                    apps
                  </HeroEntrance>
                </span>
              </span>
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
                A leap forward in designing, running, and managing Network
                Canvas interviews. This page covers what's{' '}
                <strong>changing</strong>, what's <strong>new</strong>, and what
                it <strong>means</strong> for your work.
              </Paragraph>
            </motion.div>
          </HeroEntrance>
        </div>

        <HeroEntrance
          phase="cue"
          className="absolute bottom-16 left-1/2 -translate-x-1/2"
        >
          <motion.div
            className="font-monospace flex flex-col items-center gap-3 text-xs tracking-widest text-current/55 uppercase"
            style={
              shouldReduceMotion ? undefined : { opacity: scrollCueOpacity }
            }
          >
            <span>Keep scrolling to learn more</span>
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
