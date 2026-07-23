'use client';

import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import { useRef } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Header } from '~/components/layout/Header';
import { HomepagePageBackground } from '~/components/ui/HomepagePageBackground';
import { cn } from '~/lib/cn';

import { HeroEntrance } from './HeroEntrance';
import { HeroSignalField } from './HeroSignalField';
import { Section } from './Section';

const heroTextGlowClasses =
  'bg-[conic-gradient(from_var(--text-glow-angle),var(--color-neon-coral),var(--color-sea-serpent),var(--color-mustard),var(--color-sea-green),var(--color-neon-coral))] bg-clip-text';

export function LaunchHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();
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

  return (
    <Section
      ref={sectionRef}
      className="m-0! flex min-h-svh flex-col overflow-hidden px-0!"
      aria-labelledby="summer-update-title"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="from-slate-blue/25 via-sea-serpent/10 absolute inset-0 bg-linear-to-b to-transparent" />
        <HomepagePageBackground />
        <HeroSignalField />
      </div>
      <HeroEntrance delay={0.05} direction="down">
        <Header className="relative z-20" containerClassName="py-6!" />
      </HeroEntrance>

      <div className="tablet-portrait:pt-24 tablet-portrait:pb-48 relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-12 px-6 pt-16 pb-40 text-center">
        <HeroEntrance delay={0.32} className="w-full">
          <motion.div
            className="origin-center will-change-transform"
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
              Introducing the next generation of{' '}
              <span
                data-homepage-weave-target
                className={cn(
                  heroTextGlowClasses,
                  'relative overflow-visible px-2 whitespace-nowrap text-white',
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
                Network Canvas
              </span>{' '}
              apps
            </Heading>
          </motion.div>
        </HeroEntrance>
        <HeroEntrance delay={0.62}>
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
              A leap forward in designing, running, and managing Network Canvas
              interviews. This page covers what's <strong>changing</strong>,
              what's <strong>new</strong>, and what it <strong>means</strong>{' '}
              for your work.
            </Paragraph>
          </motion.div>
        </HeroEntrance>
      </div>

      <HeroEntrance
        delay={1.1}
        className="absolute bottom-16 left-1/2 z-10 -translate-x-1/2"
      >
        <motion.div
          className="font-monospace flex flex-col items-center gap-3 text-xs tracking-widest text-current/55 uppercase"
          style={shouldReduceMotion ? undefined : { opacity: scrollCueOpacity }}
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
    </Section>
  );
}
