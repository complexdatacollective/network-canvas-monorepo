'use client';

import { ArrowRight } from 'lucide-react';
import { useMotionValueEvent, useScroll } from 'motion/react';
import { useTranslations } from 'next-intl';
import {
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import useHasHydrated from '@codaco/fresco-ui/hooks/useHasHydrated';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useHidePageBackground } from '~/components/ui/pageBackgroundVisibility';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { cn } from '~/lib/cn';
import { Link } from '~/lib/i18n/navigation';
import type { Publication } from '~/lib/siteContent';

import type { AuthorshipGraph } from './publicationNetworkLayout';
import {
  hubColor,
  PageGlyph,
  PublicationNetworkStage,
  type StageKind,
} from './PublicationNetworkStage';

// Every publication that has used Network Canvas, drawn as the network its
// author lists make. Only the newest get a card; as each reaches the reading
// line the camera frames it inside the network. After the last card the
// camera pulls back to the whole body of work, beside the link to the full
// list.

// How many of the newest publications get a card.
const CARD_COUNT = 8;
const headingId = 'recent-publications-heading';
// The network is shown only on screens this wide; narrower ones get the
// cards alone.
const wideQuery = '(min-width: 1024px)';
// Where the reading line sits, as a fraction of the viewport height.
const FOCAL = 0.5;

type Stage = { kind: StageKind; index: number };
type HubStyle = CSSProperties & { '--hub': string };

function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

function renderStrong(chunks: ReactNode) {
  return <strong className="text-text">{chunks}</strong>;
}

export function PublicationsNetwork({
  graph,
  publications,
}: {
  graph: AuthorshipGraph;
  publications: readonly Publication[];
}) {
  const t = useTranslations('Publications');
  const cards = publications.slice(0, CARD_COUNT);
  const hasHydrated = useHasHydrated();
  const prefersReducedMotion = usePrefersReducedMotion();
  const motionEnabled = hasHydrated && prefersReducedMotion === false;
  const isWide = useMediaQuery(wideQuery);
  const [stage, setStage] = useState<Stage>({ kind: 'intro', index: -1 });
  const [focusedRelated, setFocusedRelated] = useState<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const readingRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);

  // The page's background weave would compete with the network's colours.
  useHidePageBackground(sectionRef, isWide);

  const { scrollY } = useScroll();
  const { scrollYProgress: bloom } = useScroll({
    target: layoutRef,
    offset: ['start 85%', 'start 10%'],
  });

  // Card and final-link positions in document coordinates, measured when the
  // layout changes size rather than on every scroll frame.
  const boundsRef = useRef<{ top: number; bottom: number }[]>([]);

  const updateStage = useCallback(() => {
    const bounds = boundsRef.current;
    const first = bounds[0];
    const focal = window.scrollY + window.innerHeight * FOCAL;
    let next: Stage = { kind: 'intro', index: -1 };
    // Narrow screens have no network to follow the reader.
    if (isWide && first && focal >= first.top) {
      // A stop is read for as long as the reading line is inside it. The
      // card stops share one height, so every card is read for the same
      // distance however long its title.
      const reading = bounds.findIndex(({ bottom }) => focal < bottom);
      next =
        reading === -1 || reading === bounds.length - 1
          ? { kind: 'finale', index: -1 }
          : { kind: 'card', index: reading };
    }
    setStage((current) =>
      current.kind === next.kind && current.index === next.index
        ? current
        : next,
    );
  }, [isWide]);

  useEffect(() => {
    const reading = readingRef.current;
    if (!reading) return undefined;
    const measure = () => {
      boundsRef.current = [
        ...reading.querySelectorAll<HTMLElement>('[data-reading-stop]'),
      ].map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top + window.scrollY,
          bottom: rect.bottom + window.scrollY,
        };
      });
      updateStage();
    };
    // The page above the section can change height too (fonts, images),
    // which moves the cards without resizing them.
    const observer = new ResizeObserver(() => measure());
    observer.observe(reading);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [updateStage]);

  useMotionValueEvent(scrollY, 'change', updateStage);

  // A keyboard visitor moving through the links brings each stop to the
  // reading line, so the network follows them too.
  const onStopFocus = (event: FocusEvent<HTMLAnchorElement>) => {
    if (!isWide || !event.currentTarget.matches(':focus-visible')) return;
    const stop = event.currentTarget.closest('[data-reading-stop]');
    if (!stop) return;
    const rect = stop.getBoundingClientRect();
    window.scrollTo({
      top:
        window.scrollY +
        rect.top +
        rect.height / 2 -
        window.innerHeight * FOCAL,
    });
  };

  const activeHub = stage.kind === 'card' ? graph.hubs[stage.index] : undefined;

  // On wide screens the text sits in one column over a full-width network;
  // narrow screens show the text alone.
  const column =
    'tablet-landscape:col-start-1 tablet-landscape:ml-[max(2.5rem,calc(50%-750px+2.5rem))] tablet-landscape:w-[min(34rem,44%)] tablet-landscape:px-0 relative px-6';

  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      className="tablet-landscape:my-32 my-20"
    >
      <div ref={layoutRef} className="tablet-landscape:grid">
        <div
          className={cn(
            column,
            'tablet-landscape:row-start-1 tablet-landscape:flex tablet-landscape:min-h-svh tablet-landscape:flex-col tablet-landscape:justify-center tablet-landscape:pb-0 tablet-landscape:z-10 pb-10',
          )}
        >
          <SectionHeading
            title={t('heading')}
            id={headingId}
            className="tablet-landscape:mx-0 tablet-landscape:text-left"
          >
            <Paragraph margin="none">
              {t.rich('introduction', {
                count: cards.length,
                strong: renderStrong,
              })}
            </Paragraph>
          </SectionHeading>
        </div>

        <div
          aria-hidden
          className="tablet-landscape:block sticky top-0 z-0 col-start-1 row-span-2 row-start-1 hidden h-svh self-start [--network-ground:var(--background)]"
        >
          <PublicationNetworkStage
            graph={graph}
            publications={publications}
            kind={stage.kind}
            active={activeHub}
            bloom={bloom}
            motionEnabled={motionEnabled}
            columnRef={readingRef}
            focusedRelated={focusedRelated}
            legend={{
              publication: t('legendPublication'),
              author: t('legendAuthor'),
            }}
          />
        </div>

        <div
          ref={readingRef}
          className={cn(
            column,
            'tablet-landscape:row-start-2 tablet-landscape:z-10 tablet-landscape:pb-[30svh] pt-6',
          )}
        >
          {/* Equal rows, as tall as the tallest card, give every card the
              same scroll distance while the network follows the reader. */}
          <ol className="tablet-landscape:grid tablet-landscape:auto-rows-fr">
            {cards.map((publication, index) => {
              const state =
                stage.kind !== 'card'
                  ? 'idle'
                  : stage.index === index
                    ? 'active'
                    : 'dim';
              return (
                <PublicationCard
                  key={publication.id}
                  publication={publication}
                  index={index}
                  state={state}
                  onFocus={onStopFocus}
                  related={
                    state === 'active'
                      ? (graph.hubs[index]?.partners ?? []).flatMap(
                          (partner) => {
                            const other = publications[partner];
                            return other ? [{ index: partner, ...other }] : [];
                          },
                        )
                      : []
                  }
                  relatedLabel={t('relatedLabel')}
                  onRelatedFocus={setFocusedRelated}
                />
              );
            })}
          </ol>
          <AllPublicationsLink
            label={t('viewAll', {
              count: publications.length,
              authors: graph.authors.size,
            })}
            current={stage.kind === 'finale'}
            onFocus={onStopFocus}
          />
        </div>
      </div>
    </section>
  );
}

function PublicationCard({
  publication,
  index,
  state,
  onFocus,
  related,
  relatedLabel,
  onRelatedFocus,
}: {
  publication: Publication;
  index: number;
  state: 'idle' | 'active' | 'dim';
  onFocus: (event: FocusEvent<HTMLAnchorElement>) => void;
  // Publications sharing an author with this one, while it is being read.
  related: (Publication & { index: number })[];
  relatedLabel: string;
  onRelatedFocus: (index: number | null) => void;
}) {
  const hubStyle: HubStyle = { '--hub': hubColor(index) };

  return (
    <li
      data-reading-stop
      className="tablet-landscape:min-h-[36svh] flex flex-col justify-center py-3"
    >
      <a
        href={publication.href}
        target="_blank"
        rel="noreferrer"
        onFocus={onFocus}
        style={hubStyle}
        className={cn(
          'focusable bg-surface/60 text-text hover:bg-surface/85 tablet-portrait:p-7 relative block w-full overflow-hidden rounded p-6 backdrop-blur-md transition-opacity duration-500',
          state === 'dim' && 'opacity-40',
          state === 'active' && 'elevation-medium',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0 left-0 w-1.5 origin-top bg-(--hub) transition-transform duration-500 ease-out',
            state === 'active' ? 'scale-y-100' : 'scale-y-0',
          )}
        />
        <Heading
          level="h3"
          margin="none"
          className="tablet-landscape:text-xl text-lg leading-snug font-bold"
        >
          {publication.title}
        </Heading>
        <p className="text-text/80 mt-3 text-sm">
          <svg
            aria-hidden
            viewBox="0 0 12 14"
            className="mr-2.5 inline-block h-3.5 w-3 fill-(--hub) align-[-0.15em]"
          >
            <PageGlyph />
          </svg>
          <cite className="mr-3 font-semibold">{publication.source}</cite>
          <time dateTime={publication.year} className="text-text/60">
            {publication.year}
          </time>
        </p>
        <p className="text-text/70 mt-2 text-sm">{publication.authors}</p>
      </a>
      {/* The publications this one shares authors with can be opened from
          the network; these links put them in the keyboard order right
          after the card, and the network shows which one has focus. */}
      {related.length > 0 ? (
        <ul aria-label={relatedLabel} className="sr-only">
          {related.map((other) => (
            <li key={other.id}>
              <a
                href={other.href}
                target="_blank"
                rel="noreferrer"
                onFocus={() => onRelatedFocus(other.index)}
                onBlur={() => onRelatedFocus(null)}
              >
                {other.title}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function AllPublicationsLink({
  label,
  current,
  onFocus,
}: {
  label: string;
  current: boolean;
  onFocus: (event: FocusEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <div
      data-reading-stop
      className="tablet-landscape:min-h-[60svh] flex items-center py-3"
    >
      <Link
        href="/publications"
        onFocus={onFocus}
        className={cn(
          'focusable bg-surface/70 text-text hover:bg-surface tablet-portrait:p-10 group flex w-full items-center justify-between gap-6 rounded p-7 backdrop-blur-md transition-shadow duration-700',
          current && 'elevation-medium',
        )}
      >
        <span className="font-heading tablet-landscape:text-3xl text-2xl leading-tight font-black text-balance">
          {label}
        </span>
        <span
          aria-hidden
          className="bg-neon-coral flex size-12 shrink-0 items-center justify-center rounded-full text-white group-hover:brightness-110"
        >
          <ArrowRight className="size-6 rtl:-scale-x-100" />
        </span>
      </Link>
    </div>
  );
}
