'use client';

import { useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cn } from '~/lib/cn';
import type { Publication } from '~/lib/siteContent';

const pinnedRailMediaQuery = '(min-width: 768px) and (min-height: 640px)';
const minimumPinnedStageBreathingRoom = 128;
const subscribeToHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function subscribeToPinnedRailViewport(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(pinnedRailMediaQuery);
  mediaQuery.addEventListener('change', onStoreChange);

  return () => mediaQuery.removeEventListener('change', onStoreChange);
}

function getPinnedRailViewportSnapshot() {
  return window.matchMedia(pinnedRailMediaQuery).matches;
}

function getServerPinnedRailViewportSnapshot() {
  return false;
}

type PublicationRailProps = {
  children: ReactNode;
  headingId: string;
  publications: readonly Publication[];
  railLabel: string;
};

export function PublicationRail({
  children,
  headingId,
  publications,
  railLabel,
}: PublicationRailProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLUListElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const measurementFrameRef = useRef<number | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const hasPinnedRailViewport = useSyncExternalStore(
    subscribeToPinnedRailViewport,
    getPinnedRailViewportSnapshot,
    getServerPinnedRailViewportSnapshot,
  );
  const [measurements, setMeasurements] = useState({
    contentFits: false,
    travel: 0,
  });
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    const rail = railRef.current;
    const content = contentRef.current;

    if (!viewport || !rail || !content) return undefined;

    const measure = () => {
      const nextTravel = Math.max(
        0,
        viewport.scrollWidth - viewport.clientWidth,
      );
      const nextContentFits =
        content.scrollHeight + minimumPinnedStageBreathingRoom <=
        window.innerHeight;

      setMeasurements((current) =>
        current.travel === nextTravel && current.contentFits === nextContentFits
          ? current
          : {
              contentFits: nextContentFits,
              travel: nextTravel,
            },
      );
    };

    measure();

    const scheduleMeasurement = () => {
      if (measurementFrameRef.current !== null) {
        cancelAnimationFrame(measurementFrameRef.current);
      }

      measurementFrameRef.current = requestAnimationFrame(() => {
        measurementFrameRef.current = null;
        measure();
      });
    };

    const resizeObserver = new ResizeObserver(scheduleMeasurement);
    resizeObserver.observe(viewport);
    resizeObserver.observe(rail);
    resizeObserver.observe(content);
    window.addEventListener('resize', scheduleMeasurement);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleMeasurement);
      if (measurementFrameRef.current !== null) {
        cancelAnimationFrame(measurementFrameRef.current);
      }
    };
  }, [publications.length]);

  const isPinned =
    hasHydrated &&
    shouldReduceMotion === false &&
    hasPinnedRailViewport &&
    measurements.contentFits &&
    measurements.travel > 0;

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    const viewport = viewportRef.current;
    if (!viewport || !isPinned) return;

    viewport.scrollLeft = progress * measurements.travel;
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !isPinned) return;

    viewport.scrollLeft = scrollYProgress.get() * measurements.travel;
  }, [isPinned, measurements.travel, scrollYProgress]);

  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      data-publication-rail-mode={isPinned ? 'pinned' : 'scrollable'}
      className="tablet-landscape:my-32 my-20"
      style={
        isPinned
          ? {
              height: `calc(100svh + ${measurements.travel}px)`,
            }
          : undefined
      }
    >
      <div
        data-testid="publication-rail-stage"
        className={cn(
          'flex w-full flex-col justify-center',
          isPinned && 'tablet-landscape:py-10 sticky top-0 h-svh py-8',
        )}
      >
        <div
          ref={contentRef}
          data-testid="publication-rail-content"
          className="w-full"
        >
          <div className="tablet-landscape:px-10 w-full px-6">{children}</div>

          <ScrollArea
            ref={viewportRef}
            orientation="horizontal"
            fade={!isPinned}
            snap={isPinned ? undefined : 'proximity'}
            snapAxis="x"
            tabIndex={isPinned ? -1 : 0}
            aria-label={railLabel}
            data-testid="publication-rail-viewport"
            className="mt-8 h-auto w-full flex-none"
            viewportClassName={cn('py-6', isPinned && 'overflow-x-hidden')}
          >
            <ul
              ref={railRef}
              data-testid="publication-rail-track"
              className="tablet-landscape:px-10 flex w-max items-stretch gap-5 px-6"
            >
              {publications.map((publication) => (
                <li
                  key={publication.id}
                  className="phone-landscape:w-80 tablet-portrait:w-96 tablet-landscape:w-112 flex w-64 shrink-0 snap-start"
                >
                  <a
                    href={publication.href}
                    target="_blank"
                    rel="noreferrer"
                    className="focusable bg-surface-3/55 text-surface-3-contrast tablet-portrait:p-7 flex h-full min-h-64 w-full flex-col rounded p-6 shadow-lg backdrop-blur-md transition-transform hover:-translate-y-1 motion-reduce:transform-none"
                  >
                    <Heading
                      level="h3"
                      margin="none"
                      className="font-heading tablet-landscape:text-xl text-lg leading-snug font-bold"
                    >
                      {publication.title}
                    </Heading>
                    <Paragraph
                      margin="none"
                      className="font-heading text-surface-3-contrast/55 mt-4 text-xs font-bold tracking-widest uppercase"
                    >
                      {publication.source}
                    </Paragraph>
                    <Paragraph
                      margin="none"
                      className="text-surface-3-contrast/70 mt-3 text-sm"
                    >
                      {publication.authors}
                    </Paragraph>
                  </a>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>
      </div>
    </section>
  );
}
