'use client';

import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
} from 'motion/react';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import useHasHydrated from '@codaco/fresco-ui/hooks/useHasHydrated';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { Container } from '~/components/ui/Container';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { popEase } from '~/components/ui/useOnceInView';
import { cn } from '~/lib/cn';
import { scientificAdvisors } from '~/lib/content';
import type { TeamMember } from '~/lib/siteContent';

import {
  measureThread,
  PANEL_DOT,
  reachedDots,
  type ThreadGeometry,
  threadProgress,
} from './coreTeamThreadGeometry';

// One thread runs through the team: a mustard line stitches the glass
// portrait cards together, lighting a coral node on each card as it reaches
// it, and ends on the Scientific Advisors panel. How far it has drawn follows
// the scroll, in both directions. On a phone the cards stack and the thread
// runs down their left edge. Under reduced motion the thread is drawn in full
// and every node is lit.

const glass =
  'bg-surface/55 border border-surface/75 backdrop-blur-md backdrop-saturate-[1.15] elevation-low';

const advisorShapes = ['circle', 'square', 'diamond'] as const;

function AdvisorMarker({ shape }: { shape: (typeof advisorShapes)[number] }) {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-neon-coral block size-3 shrink-0',
        shape === 'circle' && 'rounded-full',
        shape === 'square' && 'rounded-[25%]',
        shape === 'diamond' && 'scale-[0.86] rotate-45 rounded-[20%]',
      )}
    />
  );
}

/** The layer the thread or its nodes draw on, covering the wrapper. */
function ThreadLayer({
  geometry,
  className,
  children,
}: {
  geometry: ThreadGeometry;
  className: string;
  children: ReactNode;
}) {
  return (
    <svg
      aria-hidden
      width={geometry.width}
      height={geometry.height}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      className={cn(
        'pointer-events-none absolute top-0 left-0 overflow-visible',
        className,
      )}
    >
      {children}
    </svg>
  );
}

export function CoreTeam({ members }: { members: readonly TeamMember[] }) {
  const t = useTranslations('Team');
  const tAdvisors = useTranslations('ScientificAdvisors');
  // Scroll-linked styles bypass the root MotionConfig, so they wait for
  // hydration and follow the reduced-motion preference themselves.
  const reduced = usePrefersReducedMotion();
  const hasHydrated = useHasHydrated();
  const motionEnabled = hasHydrated && reduced === false;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<ThreadGeometry | null>(null);
  const geometryRef = useRef<ThreadGeometry | null>(null);
  const progress = useMotionValue(0);
  const [reached, setReached] = useState(0);

  const sync = useCallback(() => {
    const wrap = wrapRef.current;
    const current = geometryRef.current;
    if (!wrap || !current) return;
    const rect = wrap.getBoundingClientRect();
    const value = threadProgress(rect.top, rect.height, window.innerHeight);
    progress.set(value);
    setReached(reachedDots(current, value));
  }, [progress]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    let frame = 0;
    const update = () => {
      const next = measureThread(wrap);
      geometryRef.current = next;
      setGeometry(next);
      sync();
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(wrap);
    for (const card of wrap.querySelectorAll('[data-thread-card]')) {
      observer.observe(card);
    }
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [sync]);

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', sync);

  return (
    <section className="overflow-x-clip">
      <Container>
        <SectionHeading title={t('heading')}>
          {t('introduction')}
        </SectionHeading>

        <div
          ref={wrapRef}
          className="tablet-landscape:mt-18 tablet-landscape:max-w-none relative mx-auto mt-14 max-w-[560px]"
        >
          {geometry ? (
            <ThreadLayer geometry={geometry} className="z-0">
              <motion.path
                d={geometry.d}
                fill="none"
                strokeWidth={4}
                strokeLinecap="round"
                className="stroke-mustard"
                style={motionEnabled ? { pathLength: progress } : undefined}
              />
            </ThreadLayer>
          ) : null}

          <ul
            aria-label={t('heading')}
            className="tablet-landscape:ml-0 tablet-landscape:grid-cols-4 tablet-landscape:gap-x-7 tablet-landscape:gap-y-21 relative z-1 ml-5.5 grid grid-cols-1 gap-y-4.5"
          >
            {members.map((member) => (
              <li
                key={member.id}
                data-thread-card
                className={cn(
                  glass,
                  'hover:bg-surface/85 hover:elevation-medium tablet-landscape:block tablet-landscape:rounded-[28px] tablet-landscape:p-3 tablet-landscape:pb-5.5 flex items-center gap-4 rounded-[22px] p-2.5 pr-3.5',
                )}
              >
                <img
                  src={member.photo}
                  alt=""
                  className="tablet-landscape:w-full tablet-landscape:rounded-[18px] aspect-square w-22 shrink-0 rounded-[14px] object-cover"
                />
                <div className="tablet-landscape:px-2.5 min-w-0">
                  <p className="font-heading text-text tablet-landscape:mt-4 tablet-landscape:text-xl text-lg leading-tight font-extrabold tracking-[-0.015em]">
                    {member.name}
                  </p>
                  <p className="text-base-sm text-text/65 mt-1 leading-snug">
                    {member.institution}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div
            data-thread-panel
            className={cn(
              glass,
              'tablet-landscape:mt-24 tablet-landscape:px-10 tablet-landscape:pt-11 tablet-landscape:pb-10 relative z-1 mx-auto mt-14 max-w-[900px] rounded-[28px] px-5.5 pt-8 pb-7 text-center',
            )}
          >
            <Heading
              level="h3"
              variant="subheading"
              margin="none"
              className="text-text"
            >
              {tAdvisors('heading')}
            </Heading>
            <ul className="tablet-landscape:gap-x-7.5 tablet-landscape:gap-y-3 mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2.5">
              {scientificAdvisors.map((name, index) => (
                <li
                  key={name}
                  className="text-text/80 tablet-landscape:text-lg flex items-center gap-2.5 text-base"
                >
                  <AdvisorMarker
                    shape={
                      advisorShapes[index % advisorShapes.length] ?? 'circle'
                    }
                  />
                  {name}
                </li>
              ))}
            </ul>
          </div>

          {geometry ? (
            <ThreadLayer geometry={geometry} className="z-2">
              {geometry.dots.map((dot, index) => {
                const lit = !motionEnabled || index < reached;
                return (
                  <motion.circle
                    key={dot.card}
                    cx={dot.x}
                    cy={dot.y}
                    r={dot.card === PANEL_DOT ? 11 : 9}
                    strokeWidth={3}
                    initial={false}
                    animate={{ scale: lit ? 1 : 0.7 }}
                    transition={
                      motionEnabled
                        ? { duration: 0.35, ease: popEase }
                        : { duration: 0 }
                    }
                    className={cn(
                      'stroke-neon-coral',
                      lit ? 'fill-neon-coral' : 'fill-surface',
                    )}
                  />
                );
              })}
            </ThreadLayer>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
