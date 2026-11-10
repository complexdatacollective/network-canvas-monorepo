'use client';

import { ArrowUpRight } from 'lucide-react';
import {
  type MotionValue,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from 'motion/react';
import { useTranslations } from 'next-intl';
import {
  type CSSProperties,
  type MouseEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import useHasHydrated from '@codaco/fresco-ui/hooks/useHasHydrated';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { Container } from '~/components/ui/Container';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { cn } from '~/lib/cn';
import type { Grant } from '~/lib/siteContent';

import { GrantLogo } from './GrantLogo';

// Each grant is a card that slides up and settles on the one before it, so by
// the end of the section the reader is holding a pile of funded studies. The
// cards are pinned in full-height frames that all release together; each frame
// overlaps the last by a quarter of the viewport, which sets how far the reader
// scrolls between cards.

const FRAME_OVERLAP = 0.25;

// The four petals of the Network Canvas mark, in mark order. Grants take them
// in turn so each one keeps a recognisable colour in the index and the pile.
const accents = [
  'oklch(var(--neon-coral))',
  'oklch(var(--sea-green))',
  'oklch(var(--cerulean-blue))',
  'oklch(var(--mustard))',
] as const;

function grantAccent(index: number) {
  return accents[index % accents.length] ?? accents[0];
}

/** An inline style that may also set CSS custom properties. */
type StyleWithVariables = CSSProperties & Record<`--${string}`, string>;

type StackGeometry = {
  // Window scroll position at which each card settles into the pile.
  settle: readonly number[];
  // Scroll distance between two settles.
  interval: number;
  // Whether every card fits its frame; if one does not, the pile becomes a
  // plain list so nothing is ever hidden under the next card.
  fits: boolean;
  // Whether the heading, introduction and index fit one viewport; if they do
  // not, that column scrolls with the page instead of pinning half out of view.
  columnFits: boolean;
  // Where the first card pins, in px from the viewport top.
  stackTop: number;
  // Every card takes the tallest card's height, so the pile has one edge.
  cardHeight: number;
};

function documentTop(element: HTMLElement) {
  let top = 0;
  let current: HTMLElement | null = element;
  while (current) {
    top += current.offsetTop;
    current =
      current.offsetParent instanceof HTMLElement ? current.offsetParent : null;
  }
  return top;
}

function interpolateStops(value: number, stops: readonly number[]) {
  // Maps a scroll position onto 0…n-1 along the settle positions.
  const first = stops[0];
  if (first === undefined) return 0;
  if (value <= first) return 0;
  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1] ?? 0;
    const next = stops[index] ?? previous;
    if (value <= next) {
      const span = Math.max(1, next - previous);
      return index - 1 + (value - previous) / span;
    }
  }
  return stops.length - 1;
}

function verticalPadding(element: Element) {
  const style = getComputedStyle(element);
  return (
    Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
  );
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function Grants({ grants }: { grants: readonly Grant[] }) {
  const t = useTranslations('Grants');
  const headingId = useId();
  // The root `MotionConfig` only neutralises animations; a MotionValue bound
  // to `style` applies verbatim, so the scroll-scrubbed styles are gated here
  // (the same rule as `components/ui/Reveal.tsx`). `useHasHydrated()` keeps
  // the server render and the hydrating render on the plain style.
  const prefersReducedMotion = usePrefersReducedMotion();
  const hasHydrated = useHasHydrated();
  const motionEnabled = hasHydrated && prefersReducedMotion === false;
  const listRef = useRef<HTMLOListElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const columnContentRef = useRef<HTMLDivElement>(null);
  const minTopProbe = useRef<HTMLDivElement>(null);
  const stepProbe = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<StackGeometry | null>(null);
  const [active, setActive] = useState(0);
  const { scrollY } = useScroll();

  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;

    const measure = () => {
      const frames = Array.from(list.children).filter(
        (child): child is HTMLElement => child instanceof HTMLLIElement,
      );
      const firstFrame = frames[0];
      if (!firstFrame) return;
      const viewport = window.innerHeight;
      const interval = firstFrame.offsetHeight * (1 - FRAME_OVERLAP);
      const listTop = documentTop(list);
      // A pinned frame's offsetTop moves while it is stuck, so the pile's
      // positions come from the list; as a plain list, a card counts as
      // current once its top passes the upper third of the viewport.
      const pinned = getComputedStyle(firstFrame).position === 'sticky';
      const settle = frames.map((frame, index) =>
        pinned ? listTop + index * interval : documentTop(frame) - viewport / 3,
      );

      // Centre the finished pile in the viewport, but never closer to the
      // top than the minimum.
      const minTop = minTopProbe.current?.offsetHeight ?? 0;
      const step = stepProbe.current?.offsetHeight ?? 0;
      // Natural card heights, read from each card's body so the shared
      // minimum height below never feeds back into the measurement.
      const tallest = Math.max(
        ...frames.map((frame) => {
          const card = frame.firstElementChild;
          const body = card?.querySelector('[data-card-body]');
          if (!(card instanceof HTMLElement) || !(body instanceof HTMLElement))
            return 0;
          return body.offsetHeight + verticalPadding(card);
        }),
      );
      const pile = tallest + (frames.length - 1) * step;
      const stackTop = Math.round(
        Math.max(minTop, (viewport - pile) / 2 + step),
      );
      const fits = minTop + pile + 16 <= viewport;

      const column = columnRef.current;
      const columnContent = columnContentRef.current;
      const columnFits =
        !column ||
        !columnContent ||
        columnContent.offsetHeight + verticalPadding(column) <= viewport;

      setGeometry((current) =>
        current &&
        current.fits === fits &&
        current.columnFits === columnFits &&
        current.interval === interval &&
        current.stackTop === stackTop &&
        current.cardHeight === tallest &&
        current.settle.every((value, index) => value === settle[index])
          ? current
          : {
              settle,
              interval,
              fits,
              columnFits,
              stackTop,
              cardHeight: tallest,
            },
      );
    };

    const observer = new ResizeObserver(measure);
    observer.observe(list);
    if (columnContentRef.current) observer.observe(columnContentRef.current);
    for (const child of Array.from(list.children)) {
      if (child.firstElementChild) observer.observe(child.firstElementChild);
    }
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const stacked = geometry?.fits ?? true;
  const columnPinned = geometry?.columnFits ?? true;
  const settle = geometry?.settle ?? [];

  const progress = useTransform(scrollY, (value) =>
    interpolateStops(value, settle),
  );
  useMotionValueEvent(progress, 'change', (value) => {
    const next = Math.min(grants.length - 1, Math.round(value));
    setActive((current) => (current === next ? current : next));
  });

  const railFill = useTransform(progress, (value) =>
    grants.length > 1 ? value / (grants.length - 1) : 1,
  );

  if (grants.length === 0) return null;

  // Scrolls to where a card has just landed on top of the pile. Returns
  // whether it did: as a plain list the page scrolls the browser's own way.
  const bringToFront = (index: number) => {
    const target = settle[index];
    if (target === undefined || !stacked) return false;
    window.scrollTo({ top: target + 2 });
    return true;
  };

  const jumpTo = (index: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!bringToFront(index)) return;
    event.preventDefault();
    document
      .getElementById(`${headingId}-grant-${index}`)
      ?.focus({ preventScroll: true });
  };

  // Steps between card tops in the pile, capped so long lists stay compact.
  const stepRem = Math.min(1.5, 6 / Math.max(1, grants.length - 1));
  const sectionStyle: StyleWithVariables = {
    '--stack-step': `${stepRem}rem`,
    ...(geometry
      ? {
          '--stack-top': `${geometry.stackTop}px`,
          '--card-height': `${geometry.cardHeight}px`,
        }
      : {}),
  };

  return (
    <Container maxWidth="wide">
      <section
        aria-labelledby={headingId}
        className="tablet-landscape:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] tablet-landscape:gap-16 laptop:gap-24 tablet-landscape:[--stack-min:7rem] tablet-landscape:[@media(max-height:820px)]:[--stack-min:5rem] grid grid-cols-1 gap-10 [--stack-min:4.5rem] [--stack-top:var(--stack-min)]"
        style={sectionStyle}
      >
        {/* A full-height pinned frame, like the cards', so the column and the
            pile let go at the same moment. */}
        <div
          ref={columnRef}
          className={cn(
            'tablet-landscape:py-16 tablet-landscape:[@media(max-height:820px)]:py-8',
            columnPinned &&
              'tablet-landscape:sticky tablet-landscape:top-0 tablet-landscape:h-svh tablet-landscape:flex tablet-landscape:flex-col tablet-landscape:justify-center',
          )}
        >
          <div ref={columnContentRef}>
            <SectionHeading
              id={headingId}
              title={t('heading')}
              className="mx-0 max-w-none text-start"
              headingClassName="laptop:text-5xl laptop:[@media(max-height:820px)]:text-4xl text-balance"
              bodyClassName="text-text/75 tablet-landscape:[@media(max-height:820px)]:text-base max-w-xl text-pretty"
            >
              {t('introduction')}
            </SectionHeading>

            <ol className="tablet-landscape:flex relative mt-12 hidden flex-col gap-6 pl-10 [@media(max-height:820px)]:mt-8 [@media(max-height:820px)]:gap-4">
              <span
                aria-hidden
                className="bg-text/12 absolute top-3 bottom-3 left-[0.6875rem] w-0.5 rounded-full"
              />
              <motion.span
                aria-hidden
                className="absolute top-3 bottom-3 left-[0.6875rem] w-0.5 origin-top rounded-full"
                style={{
                  background: `linear-gradient(to bottom, ${grants
                    .map((_, index) => grantAccent(index))
                    .join(', ')})`,
                  scaleY: motionEnabled
                    ? railFill
                    : grants.length > 1
                      ? active / (grants.length - 1)
                      : 1,
                }}
              />
              {grants.map((grant, index) => {
                const reached = index <= active;
                return (
                  <li key={grant.id} className="relative">
                    <span
                      aria-hidden
                      className={cn(
                        'absolute top-1 -left-10 size-6 rounded-full border-[3px] transition-[background-color,scale] duration-300',
                        index === active ? 'scale-110' : 'scale-75',
                      )}
                      style={{
                        borderColor: grantAccent(index),
                        backgroundColor: reached
                          ? grantAccent(index)
                          : 'var(--background)',
                      }}
                    />
                    <a
                      href={`#${headingId}-grant-${index}`}
                      onClick={jumpTo(index)}
                      aria-current={index === active ? 'step' : undefined}
                      className={cn(
                        'focusable group block rounded-sm transition-colors duration-300',
                        index === active ? 'text-text' : 'text-text/50',
                      )}
                    >
                      <span className="font-heading block text-lg leading-snug font-black group-hover:underline">
                        {grant.logoAlt}
                      </span>
                      <span className="mt-0.5 line-clamp-1 text-sm">
                        {grant.title}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <div className="relative">
          <ol
            ref={listRef}
            // The pseudo-element keeps the pile pinned a little after the last
            // card lands: sticky frames release at the list's content edge,
            // which padding would not move.
            className={cn(
              stacked &&
                "tablet-landscape:after:h-[24svh] after:block after:h-[12svh] after:content-['']",
            )}
          >
            {grants.map((grant, index) => (
              <StackFrame
                key={grant.id}
                grant={grant}
                index={index}
                anchorId={`${headingId}-grant-${index}`}
                stacked={stacked}
                settle={settle}
                interval={geometry?.interval ?? 0}
                scrollY={scrollY}
                motionEnabled={motionEnabled && geometry !== null && stacked}
                onKeyboardFocus={() => bringToFront(index)}
              />
            ))}
          </ol>
          <div
            ref={minTopProbe}
            aria-hidden
            className="pointer-events-none invisible absolute top-0 left-0 h-(--stack-min) w-px"
          />
          <div
            ref={stepProbe}
            aria-hidden
            className="pointer-events-none invisible absolute top-0 left-0 h-(--stack-step) w-px"
          />
        </div>
      </section>
    </Container>
  );
}

function StackFrame({
  grant,
  index,
  anchorId,
  stacked,
  settle,
  interval,
  scrollY,
  motionEnabled,
  onKeyboardFocus,
}: {
  grant: Grant;
  index: number;
  anchorId: string;
  stacked: boolean;
  settle: readonly number[];
  interval: number;
  scrollY: MotionValue<number>;
  motionEnabled: boolean;
  onKeyboardFocus: () => void;
}) {
  const accent = grantAccent(index);
  const ownSettle = settle[index] ?? 0;
  const laterSettles = settle.slice(index);

  // 0 while the card is still travelling up from below, 1 once it has settled.
  const arrival = useTransform(scrollY, (value) =>
    interval > 0 ? clamp01(1 - (ownSettle - value) / interval) : 1,
  );
  // How many later cards have landed on this one (fractional while one moves).
  const depth = useTransform(scrollY, (value) =>
    interpolateStops(value, laterSettles),
  );

  const transform = useTransform([arrival, depth], (values: number[]) => {
    const [a = 1, d = 0] = values;
    const settleScale = 0.9 + 0.1 * a;
    const depthScale = 1 - 0.045 * d;
    const tilt = (1 - a) * 22;
    return `perspective(1600px) rotateX(${tilt.toFixed(2)}deg) scale(${(settleScale * depthScale).toFixed(4)})`;
  });
  const shade = useTransform(depth, (d) => Math.min(0.55, d * 0.2));
  const logoY = useTransform(arrival, (a) => (1 - a) * -18);
  // The colour band runs out across the card as it lands.
  const stripe = useTransform(arrival, (a) => 0.12 + 0.88 * a);

  const frameStyle: StyleWithVariables = {
    '--grant-accent': accent,
    ...(stacked
      ? {
          // Padding rather than a margin on the card, which would collapse
          // through the frame.
          paddingTop: `calc(var(--stack-top) + ${index} * var(--stack-step))`,
          marginTop: index > 0 ? `-${FRAME_OVERLAP * 100}svh` : undefined,
        }
      : {}),
  };

  return (
    <li
      className={cn(
        'pointer-events-none',
        stacked ? 'sticky top-0 h-svh' : 'not-first:mt-6',
      )}
      style={frameStyle}
    >
      <motion.article
        className={cn(
          'group/card focusable-within bg-surface elevation-high pointer-events-auto relative isolate overflow-hidden rounded',
          stacked && 'min-h-(--card-height)',
          'tablet-portrait:p-10 laptop:p-12 tablet-portrait:[@media(max-height:820px)]:p-8 p-6 pt-7',
          'origin-top will-change-transform',
        )}
        style={{
          transform: motionEnabled ? transform : undefined,
          zIndex: index,
        }}
        // A card lower in the pile is covered by the ones above it, so a
        // card reached from the keyboard is scrolled back to the top of the
        // pile. Not for a pointer: scrolling between press and release would
        // move the card out from under the click.
        onFocus={(event) => {
          if (event.target.matches(':focus-visible')) onKeyboardFocus();
        }}
      >
        <motion.span
          aria-hidden
          className="absolute inset-x-0 top-0 h-2 origin-left"
          style={{
            backgroundColor: accent,
            scaleX: motionEnabled ? stripe : 1,
          }}
        />

        <div data-card-body>
          <div className="flex items-start justify-between gap-6">
            <motion.div
              className="tablet-portrait:[--logo-size:4.5rem] tablet-portrait:[@media(max-height:820px)]:[--logo-size:3.5rem] ring-text/10 rounded-sm bg-white px-4 py-3 ring-1 [--logo-size:3.25rem]"
              style={motionEnabled ? { y: logoY } : undefined}
            >
              <GrantLogo src={grant.logo} alt={grant.logoAlt} />
            </motion.div>
            <span
              aria-hidden
              className="bg-text/6 text-text flex size-11 shrink-0 items-center justify-center rounded-full group-hover/card:bg-(--grant-accent) group-hover/card:text-white"
            >
              <ArrowUpRight className="size-5" />
            </span>
          </div>

          <div>
            <Heading
              level="h3"
              margin="none"
              className="text-text tablet-portrait:text-3xl tablet-portrait:mt-10 tablet-portrait:[@media(max-height:820px)]:mt-6 tablet-portrait:[@media(max-height:820px)]:text-2xl mt-6 text-2xl leading-tight font-black text-balance"
            >
              <a
                id={anchorId}
                href={grant.href}
                target="_blank"
                rel="noreferrer"
                className="outline-none after:absolute after:inset-0 after:z-10 after:content-['']"
              >
                {grant.title}
              </a>
            </Heading>
            <p className="text-text/60 mt-4 text-sm font-bold">{grant.pis}</p>
            <p className="text-text/80 tablet-portrait:text-base mt-4 max-w-[62ch] text-base leading-relaxed">
              {grant.description}
            </p>
          </div>
        </div>

        <motion.span
          aria-hidden
          className="bg-background pointer-events-none absolute inset-0 z-20"
          style={{ opacity: motionEnabled ? shade : 0 }}
        />
      </motion.article>
    </li>
  );
}
