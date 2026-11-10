'use client';

import {
  motion,
  type MotionValue,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { Button } from '@codaco/fresco-ui/Button';
import useHasHydrated from '@codaco/fresco-ui/hooks/useHasHydrated';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { DeviceMockup } from '~/components/ui/DeviceMockup';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { cn } from '~/lib/cn';
import { type Tool, tools } from '~/lib/content';
import { webDestinations } from '~/lib/getStarted';

import {
  type AnchorId,
  anchorIds,
  type CardGeometry,
  type Geometry,
  measureGeometry,
  type ThreadColor,
  threadSegments,
  toolInAnchor,
} from './toolsThreadGeometry';
import { NetworkBloom, ThreadNode, ThreadSegment } from './ToolsThreadGraphics';

// One network edge runs through the section. It leaves the heading, draws
// itself into Architect, then forks — a protocol designed once is collected
// either in person (Interviewer) or on the web (Fresco) — and the two strands
// rejoin in a small network: the data both routes produce. The thread is
// scroll-scrubbed, and so is each tool's card: it blooms out of its node as
// the thread runs on past it, and closes back onto the node if the reader
// scrolls back up.

// The thread's tip sits on this line of the viewport (fraction from the top).
const READING_LINE = 0.7;
// How far past a card's node the thread runs while the card opens, as a
// fraction of the viewport height.
const BLOOM_SPAN = 0.35;

const accents = {
  'sea-green': {
    text: 'text-sea-green',
    button: 'bg-sea-green text-white',
  },
  'neon-coral': {
    text: 'text-neon-coral',
    button: 'bg-neon-coral text-white',
  },
  'cerulean-blue': {
    text: 'text-cerulean-blue',
    button: 'bg-cerulean-blue text-white',
  },
  'slate-blue': {
    text: 'text-slate-blue',
    button: 'bg-slate-blue text-white',
  },
} as const satisfies Record<Tool['color'], { text: string; button: string }>;

const toolNodeColor: Record<Tool['id'], ThreadColor> = {
  architect: 'sea-green',
  interviewer: 'neon-coral',
  fresco: 'slate-blue',
};

function ToolActions({ tool, className }: { tool: Tool; className?: string }) {
  const t = useTranslations('Tools');

  return (
    <div className={cn('flex flex-wrap gap-3', className)}>
      <Button
        asChild
        color="default"
        className={cn('rounded-full', accents[tool.color].button)}
      >
        <a href={tool.href} target="_blank" rel="noreferrer">
          {t(`${tool.id}.action`)}
        </a>
      </Button>
      {tool.id === 'fresco' ? (
        // White in both themes: slate-blue text on the dark theme's surface
        // falls short of WCAG AA.
        <Button
          asChild
          color="default"
          className="text-slate-blue rounded-full bg-white"
        >
          <a
            href={webDestinations.frescoDeployment}
            target="_blank"
            rel="noreferrer"
          >
            {t('fresco.deployAction')}
          </a>
        </Button>
      ) : null}
    </div>
  );
}

function ToolPreview({ tool, className }: { tool: Tool; className?: string }) {
  return (
    <a
      href={tool.href}
      target="_blank"
      rel="noreferrer"
      className={cn('focusable block rounded', className)}
    >
      <DeviceMockup variant={tool.variant} />
    </a>
  );
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

// A tool's card. The card blooms out of its node: a circular clip that opens
// from the node's position as the thread runs on past it, scrubbed by the
// reader's scroll in both directions.
function ToolCard({
  labelledBy,
  card,
  nodeY,
  readY,
  motionEnabled,
  className,
  children,
}: {
  labelledBy: string;
  card: CardGeometry | undefined;
  // Where the thread arrives at the card, in the same space as `readY`.
  nodeY: number | undefined;
  readY: MotionValue<number>;
  motionEnabled: boolean;
  className?: string;
  children: ReactNode;
}) {
  // A keyboard user can reach a card before the thread does; while focus is
  // inside, the card stays open so the focused control is never hidden.
  const focusOpen = useMotionValue(0);
  // 0 = closed on the node, 1 = open past the farthest corner.
  const bloom = useTransform(() => {
    if (nodeY === undefined) return 1;
    const travelled = (readY.get() - nodeY) / (window.innerHeight * BLOOM_SPAN);
    return Math.max(
      focusOpen.get(),
      easeOut(Math.min(1, Math.max(0, travelled))),
    );
  });
  const clipPath = useTransform(bloom, (progress) => {
    if (!card) return 'none';
    const { node, width, height } = card;
    // Far enough to clear the farthest corner and the card's shadow.
    const radius =
      Math.hypot(
        Math.max(node.x, width - node.x),
        Math.max(node.y, height - node.y),
      ) + 120;
    return `circle(${progress * radius}px at ${node.x}px ${node.y}px)`;
  });

  return (
    <motion.article
      aria-labelledby={labelledBy}
      onFocusCapture={() => focusOpen.set(1)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          focusOpen.set(0);
        }
      }}
      style={motionEnabled && card ? { clipPath } : undefined}
      className={cn(
        'bg-surface/60 relative z-10 rounded shadow-xl backdrop-blur-md',
        className,
      )}
    >
      {children}
    </motion.article>
  );
}

export function Tools() {
  const t = useTranslations('Tools');
  // Scroll-linked `MotionValue` styles are bound straight to `style`, so the
  // root `MotionConfig` cannot neutralise them. Like `Reveal`, hold them back
  // for the server render and the hydrating render, then follow the visitor's
  // reduced-motion preference.
  const shouldReduceMotion = usePrefersReducedMotion();
  const hasHydrated = useHasHydrated();
  const motionEnabled = hasHydrated && shouldReduceMotion === false;
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const headingId = `${id}-heading`;
  const toolHeadingId = (tool: Tool) => `${id}-${tool.id}`;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const geometryRef = useRef<Geometry | null>(null);
  // Which anchors the thread has reached; nodes follow the thread both ways.
  const [reached, setReached] = useState<ReadonlySet<AnchorId>>(
    new Set<AnchorId>(),
  );

  const readY = useMotionValue(0);
  const smoothReadY = useSpring(readY, {
    stiffness: 150,
    damping: 30,
    mass: 0.5,
  });
  const { scrollY } = useScroll();

  const readingLine = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return 0;
    return (
      window.innerHeight * READING_LINE - wrapper.getBoundingClientRect().top
    );
  }, []);

  const syncState = useCallback((value: number) => {
    const current = geometryRef.current;
    if (!current) return;
    const isPast = (anchor: AnchorId) =>
      value >= (current.points.get(anchor)?.y ?? 0) - 2;
    const nextReached = anchorIds.filter(isPast);
    setReached((previous) =>
      previous.size === nextReached.length &&
      nextReached.every((anchor) => previous.has(anchor))
        ? previous
        : new Set(nextReached),
    );
  }, []);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;

    const measure = () => {
      const next = measureGeometry(wrapper);
      if (!next) return;
      geometryRef.current = next;
      setGeometry(next);
      const value = readingLine();
      readY.jump(value);
      smoothReadY.jump(value);
      syncState(value);
    };

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(wrapper);
    for (const box of wrapper.querySelectorAll('[data-thread-card]')) {
      observer.observe(box);
    }
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [readingLine, readY, smoothReadY, syncState]);

  useMotionValueEvent(scrollY, 'change', () => {
    readY.set(readingLine());
  });
  useMotionValueEvent(smoothReadY, 'change', syncState);

  // Before measurement, and whenever motion is off, everything is shown whole.
  const isReached = (anchor: AnchorId) =>
    !motionEnabled || !geometry || reached.has(anchor);
  const nodeY = (tool: Tool['id']) =>
    geometry?.points.get(toolInAnchor[tool])?.y;

  const [architect, interviewer, fresco] = tools;
  if (!architect || !interviewer || !fresco) return null;

  const pair = [
    {
      tool: interviewer,
      inAnchor: 'interviewerIn',
      outAnchor: 'interviewerOut',
      inPosition: 'left-[28%] tablet-portrait:left-1/2',
    },
    {
      tool: fresco,
      inAnchor: 'frescoIn',
      outAnchor: 'frescoOut',
      inPosition: 'left-[72%] tablet-portrait:left-1/2',
    },
  ] as const;

  return (
    <section aria-labelledby={headingId} className="overflow-x-clip">
      <Container>
        <div ref={wrapperRef} className="relative">
          {geometry ? (
            <svg
              aria-hidden
              width={geometry.width}
              height={geometry.height}
              className="pointer-events-none absolute inset-0 z-0 overflow-visible"
            >
              {geometry.segments.map((segment, index) => {
                const definition = threadSegments[index];
                if (!definition) return null;
                return (
                  <ThreadSegment
                    key={segment.id}
                    geometry={segment}
                    readY={smoothReadY}
                    gradientId={`${id}-${segment.id}`}
                    colors={definition.colors}
                    motionEnabled={motionEnabled}
                  />
                );
              })}
            </svg>
          ) : null}

          <SectionHeading
            id={headingId}
            title={t('heading')}
            className="relative z-10"
          >
            {t('introduction')}
          </SectionHeading>

          <div className="relative mx-auto mt-10 h-px w-px">
            <span data-thread-anchor="start" className="absolute top-0 left-0">
              <ThreadNode
                color="sea-green"
                size="sm"
                active={isReached('start')}
              />
            </span>
          </div>

          {/* Architect: where every study starts. */}
          <div
            data-thread-card="architect"
            className="tablet-landscape:mt-36 relative mt-20"
          >
            <ToolCard
              labelledBy={toolHeadingId(architect)}
              card={geometry?.cards.get('architect')}
              nodeY={nodeY('architect')}
              readY={smoothReadY}
              motionEnabled={motionEnabled}
              className="tablet-landscape:grid-cols-[1fr_1.2fr] tablet-landscape:gap-14 tablet-landscape:p-12 grid items-center gap-8 p-6"
            >
              <div className="min-w-0">
                <Heading
                  id={toolHeadingId(architect)}
                  level="h3"
                  variant="subheading"
                  margin="none"
                  className={cn(
                    'tablet-landscape:text-4xl',
                    accents[architect.color].text,
                  )}
                >
                  {architect.name}
                </Heading>
                <Paragraph
                  margin="none"
                  className="text-text tablet-landscape:text-lg mt-4 text-base leading-relaxed"
                >
                  {t('architect.description')}
                </Paragraph>
                <ToolActions tool={architect} className="mt-6" />
              </div>
              <ToolPreview tool={architect} />
            </ToolCard>
            <span
              data-thread-anchor="architectIn"
              className="tablet-landscape:left-1/4 absolute top-0 left-1/2 z-20"
            >
              <ThreadNode color="sea-green" active={isReached('architectIn')} />
            </span>
            <span
              data-thread-anchor="architectOut"
              className="absolute bottom-0 left-1/2"
            />
          </div>

          {/* The fork: two ways to collect the same protocol. */}
          <div className="tablet-portrait:grid-cols-2 tablet-landscape:mt-32 tablet-landscape:gap-10 mt-20 grid grid-cols-1 gap-20">
            {pair.map(({ tool, inAnchor, outAnchor, inPosition }) => (
              <div
                key={tool.id}
                data-thread-card={tool.id}
                className="relative flex"
              >
                <ToolCard
                  labelledBy={toolHeadingId(tool)}
                  card={geometry?.cards.get(tool.id)}
                  nodeY={nodeY(tool.id)}
                  readY={smoothReadY}
                  motionEnabled={motionEnabled}
                  className="tablet-landscape:p-10 flex w-full flex-col p-6"
                >
                  <ToolPreview tool={tool} className="mb-8" />
                  <Heading
                    id={toolHeadingId(tool)}
                    level="h3"
                    variant="subheading"
                    margin="none"
                    className={cn(
                      'tablet-landscape:text-4xl',
                      accents[tool.color].text,
                    )}
                  >
                    {tool.name}
                  </Heading>
                  <Paragraph
                    margin="none"
                    className="text-text tablet-landscape:text-lg mt-4 text-base leading-relaxed"
                  >
                    {t(`${tool.id}.description`)}
                  </Paragraph>
                  <ToolActions tool={tool} className="mt-auto pt-6" />
                </ToolCard>
                <span
                  data-thread-anchor={inAnchor}
                  className={cn('absolute top-0 z-20', inPosition)}
                >
                  <ThreadNode
                    color={toolNodeColor[tool.id]}
                    active={isReached(inAnchor)}
                  />
                </span>
                <span
                  data-thread-anchor={outAnchor}
                  className="absolute bottom-0 left-1/2"
                />
              </div>
            ))}
          </div>

          {/* Where the strands rejoin: the network data both routes produce. */}
          <div className="tablet-landscape:h-56 relative h-48">
            <span
              data-thread-anchor="end"
              className="absolute top-[62%] left-1/2 z-20"
            >
              <NetworkBloom active={isReached('end')} />
            </span>
          </div>
        </div>
      </Container>
    </section>
  );
}
