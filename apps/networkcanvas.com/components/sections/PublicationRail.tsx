'use client';

import { useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import useHasHydrated from '@codaco/fresco-ui/hooks/useHasHydrated';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { Publication } from '~/lib/siteContent';

const flowingRailMediaQuery = '(min-width: 768px) and (min-height: 640px)';

function subscribeToFlowingRailViewport(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(flowingRailMediaQuery);
  mediaQuery.addEventListener('change', onStoreChange);

  return () => mediaQuery.removeEventListener('change', onStoreChange);
}

function getFlowingRailViewportSnapshot() {
  return window.matchMedia(flowingRailMediaQuery).matches;
}

function getServerFlowingRailViewportSnapshot() {
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
  const measurementFrameRef = useRef<number | null>(null);
  const wasFlowingRef = useRef(false);
  const lastProgressRef = useRef(0);
  const shouldReduceMotion = useReducedMotion();
  const hasHydrated = useHasHydrated();
  const hasFlowingRailViewport = useSyncExternalStore(
    subscribeToFlowingRailViewport,
    getFlowingRailViewportSnapshot,
    getServerFlowingRailViewportSnapshot,
  );
  const [travel, setTravel] = useState(0);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    const rail = railRef.current;

    if (!viewport || !rail) return undefined;

    const measure = () => {
      const nextTravel = Math.max(
        0,
        viewport.scrollWidth - viewport.clientWidth,
      );

      setTravel((current) => (current === nextTravel ? current : nextTravel));
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
    window.addEventListener('resize', scheduleMeasurement);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleMeasurement);
      if (measurementFrameRef.current !== null) {
        cancelAnimationFrame(measurementFrameRef.current);
      }
    };
  }, [publications.length]);

  const isFlowing =
    hasHydrated &&
    shouldReduceMotion === false &&
    hasFlowingRailViewport &&
    travel > 0;

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    const viewport = viewportRef.current;
    if (!viewport || !isFlowing) return;

    const delta = progress - lastProgressRef.current;
    lastProgressRef.current = progress;
    viewport.scrollLeft += delta * travel;
  });

  useEffect(() => {
    const wasFlowing = wasFlowingRef.current;
    wasFlowingRef.current = isFlowing;

    // Anchor the delta baseline to the current progress instead of jumping
    // the rail: page-scroll-linked motion should nudge forward from
    // wherever a visitor left it — the default start position, or a spot
    // they scrolled to by hand — never snap it to an absolute position.
    if (isFlowing && !wasFlowing) {
      lastProgressRef.current = scrollYProgress.get();
    }
  }, [isFlowing, scrollYProgress]);

  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      data-publication-rail-mode={isFlowing ? 'flowing' : 'scrollable'}
      className="tablet-landscape:my-32 my-20"
    >
      <div
        data-testid="publication-rail-stage"
        className="flex w-full flex-col justify-center"
      >
        <div className="tablet-landscape:px-10 w-full px-6">{children}</div>

        <ScrollArea
          ref={viewportRef}
          orientation="horizontal"
          snap={isFlowing ? undefined : 'proximity'}
          snapAxis="x"
          aria-label={railLabel}
          data-testid="publication-rail-viewport"
          className="mt-8 h-auto w-full flex-none"
          viewportClassName="py-6"
        >
          <ul
            ref={railRef}
            data-testid="publication-rail-track"
            className="tablet-landscape:px-10 grid w-max grid-flow-col grid-rows-2 gap-5 px-6"
          >
            {publications.map((publication) => (
              <li
                key={publication.id}
                className="phone-landscape:w-80 tablet-portrait:w-96 tablet-landscape:w-112 w-64 snap-start"
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
                    <span aria-hidden="true"> · </span>
                    <time dateTime={publication.year} className="font-normal">
                      {publication.year}
                    </time>
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
    </section>
  );
}
