'use client';

import { ArrowUpRight } from 'lucide-react';
import {
  animate,
  type AnimationPlaybackControls,
  inView,
  motion,
  type MotionValue,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from 'motion/react';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import useHasHydrated from '@codaco/fresco-ui/hooks/useHasHydrated';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { SectionHeading } from '~/components/ui/SectionHeading';
import {
  measureStops,
  nearestStop,
  useScrollCarousel,
} from '~/components/ui/useScrollCarousel';
import { principles } from '~/lib/content';

import {
  cardScene,
  FORM_COLORS,
  FORM_SETTLED,
  smoothstep,
} from './designPrinciplesGeometry';
import { DesignPrinciplesScene } from './DesignPrinciplesScene';

// Design principles. Under a centred heading, each principle sits on a card
// beside one scene (see DesignPrinciplesScene). The cards page like a
// carousel, and the scene follows the card in view on its own clock rather
// than the scroll's: the network grows in when the canvas is first seen, and
// each card moves the scene to its form, then plays its own sequence there
// (the interview's beats, the workflow's line). Moving back plays the way
// back.

// One form to the next, and each further form when several are crossed at
// once (arriving mid-section), up to a cap.
const FORM_DURATION = 1.8;
const EXTRA_FORM_DURATION = 0.6;
const MAX_FORM_DURATION = 3.6;
// A card's own sequence, from its first beat to where it rests.
const SEQUENCE_DURATION = 2.8;
// Out of the blocks with the page, settling slowly into the new form.
const FORM_EASE = [0.33, 1, 0.68, 1] as const;

type PrincipleCopy = {
  id: (typeof principles)[number]['id'];
  href: string;
  title: string;
  paragraphs: [string, string];
};

function usePrinciplesCopy() {
  const t = useTranslations('Principles');
  const items: PrincipleCopy[] = principles.map((principle) => ({
    id: principle.id,
    href: principle.href,
    title: t(`${principle.id}.title`),
    paragraphs: [
      t(`${principle.id}.paragraph1`),
      t(`${principle.id}.paragraph2`),
    ],
  }));
  return { heading: t('heading'), introduction: t('introduction'), items };
}

/**
 * Whether scroll may drive the scene. The same gate `Reveal`'s scroll-linked
 * variant uses: false for the server render and the hydrating render alike,
 * so markup always agrees, then true only for a visitor who has not asked for
 * reduced motion.
 */
function useScrollMotionEnabled() {
  const reduce = usePrefersReducedMotion();
  const hasHydrated = useHasHydrated();
  return hasHydrated && reduce === false;
}

function PrincipleCard({
  item,
  index,
  focus,
  motionEnabled,
}: {
  item: PrincipleCopy;
  index: number;
  focus: MotionValue<number>;
  motionEnabled: boolean;
}) {
  // The card being read is full strength; the others' words recede. The card
  // itself stays solid, since it passes in front of the canvas.
  const opacity = useTransform(focus, (s) => {
    const distance = Math.abs(s - (index + 0.5));
    return 1 - 0.65 * smoothstep((distance - 0.42) / 0.4);
  });
  // The principle's key colour, which lights the canvas while it is read.
  const keyColor = `var(--color-${FORM_COLORS[index + 2] ?? 'slate-blue'})`;
  return (
    <div
      // Each card is a stop in the cards' carousel (`useScrollCarousel`).
      // Below the wide layout the canvas is pinned over the top 44% of the
      // screen, so a card rests just below it; on wide screens it rests
      // centred on the reading line, 58% down (the top margin moves the snap
      // area's centre that far).
      data-scroll-snap-stop
      className="tablet-landscape:min-h-[80svh] tablet-landscape:py-10 tablet-landscape:snap-center tablet-landscape:scroll-mt-[16svh] flex min-h-[56svh] snap-start scroll-mt-[44svh] flex-col justify-center py-6"
    >
      <article className="bg-surface elevation-high tablet-portrait:p-9 relative overflow-hidden rounded-[2rem] p-7 pt-9">
        <motion.div style={motionEnabled ? { opacity } : undefined}>
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-2"
            style={{ backgroundColor: keyColor }}
          />
          {/* The title is the link to the principle's documentation; the
              arrow says it leaves the site. Its hover state is instant. */}
          <Heading
            level="h3"
            variant="subheading"
            margin="none"
            className="text-balance"
          >
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="focusable group/title inline rounded-sm decoration-current/30 underline-offset-[0.2em] hover:underline"
            >
              {item.title}
              <ArrowUpRight
                aria-hidden
                strokeWidth={3}
                className="ml-1 inline-block size-[0.8em] -translate-y-[0.06em] opacity-50 group-hover/title:opacity-100"
              />
            </a>
          </Heading>
          <div className="text-text/80 tablet-landscape:text-lg mt-5 flex flex-col gap-4 text-base leading-relaxed">
            {item.paragraphs.map((paragraph) => (
              <Paragraph key={paragraph} margin="none">
                {paragraph}
              </Paragraph>
            ))}
          </div>
        </motion.div>
      </article>
    </div>
  );
}

type Block = { top: number; height: number };

export function DesignPrinciples() {
  const { heading, introduction, items } = usePrinciplesCopy();
  const headingId = useId();
  const motionEnabled = useScrollMotionEnabled();

  const columnRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef<Block[]>([]);
  const columnHeightRef = useRef(0);

  // The card in view: the one whose resting place is nearest where the page
  // is, or is being carried to, or -1 while the reader is still above the
  // first (by half the gap to the second). Taking the carousel's destination
  // means the scene sets off as the page does.
  const [card, setCard] = useState(-1);
  const destinationRef = useRef<number | null>(null);
  const updateCard = useCallback(() => {
    const column = columnRef.current;
    if (!column) return;
    const { stops } = measureStops(column);
    const first = stops[0];
    if (first === undefined) return;
    const second = stops[1];
    const lead =
      second === undefined
        ? window.innerHeight / 2
        : (second.start - first.end) / 2;
    const position = destinationRef.current ?? window.scrollY;
    const next =
      position < first.start - lead ? -1 : (nearestStop(stops, position) ?? -1);
    setCard((current) => (current === next ? current : next));
  }, []);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', updateCard);
  const onDestination = useCallback(
    (top: number | null) => {
      destinationRef.current = top;
      updateCard();
    },
    [updateCard],
  );
  useScrollCarousel(columnRef, onDestination);

  // Whether the canvas has come into view, before any card is: the network
  // grows in as it does.
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    return inView(
      canvas,
      () => {
        setSeen(true);
        return () => setSeen(false);
      },
      { amount: 0.35 },
    );
  }, []);

  useLayoutEffect(() => {
    const column = columnRef.current;
    if (!column) return undefined;
    const measure = () => {
      blocksRef.current = Array.from(column.children)
        .filter((child) => child instanceof HTMLElement)
        .map((child) => ({ top: child.offsetTop, height: child.offsetHeight }));
      columnHeightRef.current = column.offsetHeight;
    };
    measure();
    const observer = new ResizeObserver(() => {
      measure();
      updateCard();
    });
    observer.observe(column);
    return () => observer.disconnect();
  }, [updateCard]);

  // Reading position through the cards, in cards: 0.5 is the middle of the
  // first, 4.5 the middle of the last.
  const { scrollYProgress: columnProgress } = useScroll({
    target: columnRef,
    offset: ['start 58%', 'end 58%'],
  });
  const focus = useTransform(columnProgress, (progress) => {
    const blocks = blocksRef.current;
    if (blocks.length === 0) return 0;
    const y = progress * columnHeightRef.current;
    let index = blocks.findIndex((block) => y < block.top + block.height);
    if (index === -1) index = blocks.length - 1;
    const block = blocks[index]!;
    return (
      index + Math.min(1, Math.max(0, (y - block.top) / (block.height || 1)))
    );
  });

  const phase = useMotionValue(0);
  const reading = useMotionValue(0);
  const { form, from, reading: readTo } = cardScene(card, seen);
  useEffect(() => {
    // Reduced motion: the scene cuts straight to the card's form, its
    // sequence complete (the scene is given no reading position).
    if (!motionEnabled) {
      phase.jump(form);
      return undefined;
    }
    const controls: Pick<AnimationPlaybackControls, 'stop'>[] = [];
    const distance = Math.abs(form - phase.get());
    const duration = Math.min(
      MAX_FORM_DURATION,
      FORM_DURATION + Math.max(0, distance - 1) * EXTRA_FORM_DURATION,
    );
    if (readTo >= reading.get()) {
      // On: the cards before are done; this card's sequence starts at its
      // first beat as soon as the scene has all but arrived at its form,
      // without waiting out the end of the move.
      reading.jump(Math.max(reading.get(), from));
      controls.push(animate(phase, form, { duration, ease: FORM_EASE }));
      const play = () => {
        const left = readTo - reading.get();
        controls.push(
          animate(reading, readTo, {
            duration: (SEQUENCE_DURATION * left) / (readTo - from || 1),
            ease: 'linear',
          }),
        );
      };
      if (Math.abs(form - phase.get()) <= FORM_SETTLED) {
        play();
      } else {
        const unsubscribe = phase.on('change', (value) => {
          if (Math.abs(form - value) > FORM_SETTLED) return;
          unsubscribe();
          play();
        });
        controls.push({ stop: unsubscribe });
      }
    } else {
      // Back: the sequence unwinds as the scene returns.
      controls.push(
        animate(phase, form, { duration, ease: FORM_EASE }),
        animate(reading, readTo, { duration, ease: FORM_EASE }),
      );
    }
    return () => {
      for (const control of controls) control.stop();
    };
  }, [form, from, readTo, motionEnabled, phase, reading]);

  return (
    <section aria-labelledby={headingId}>
      <Container maxWidth="wide">
        <SectionHeading id={headingId} title={heading}>
          {introduction}
        </SectionHeading>

        {/* The canvas is held in view while the cards pass. On wide
            screens it is square, at the right of its columns with its edge
            2rem into the reading column's (the padding is one column less
            2rem), so the cards pass in front of that edge but never over
            what it shows. The reading column runs on below the last card,
            so the canvas stays until that card has been read. */}
        <div className="tablet-landscape:mt-4 tablet-landscape:grid tablet-landscape:grid-cols-12 tablet-landscape:gap-x-12 mt-10">
          <div
            ref={canvasRef}
            className="tablet-landscape:col-span-8 tablet-landscape:col-start-1 tablet-landscape:row-start-1 tablet-landscape:mx-0 tablet-landscape:h-svh tablet-landscape:self-start tablet-landscape:z-0 tablet-landscape:items-center tablet-landscape:justify-end tablet-landscape:pr-[calc((100%-21rem)/8-2rem)] sticky top-0 z-10 -mx-6 flex h-[44svh]"
          >
            <DesignPrinciplesScene
              key={motionEnabled ? 'animated' : 'resting'}
              phase={phase}
              reading={motionEnabled ? reading : undefined}
              animated={motionEnabled}
              className="elevation-high tablet-landscape:aspect-square tablet-landscape:h-auto tablet-landscape:max-h-[86svh] tablet-landscape:max-w-[86svh] tablet-landscape:rounded-[2.5rem] h-full w-full rounded-b-[2rem]"
            />
          </div>

          <div
            ref={columnRef}
            data-reading-column
            className="tablet-landscape:col-span-5 tablet-landscape:col-start-8 tablet-landscape:row-start-1 tablet-landscape:z-10 tablet-landscape:pt-[45svh] tablet-landscape:pb-[42svh] relative"
          >
            {items.map((item, index) => (
              <PrincipleCard
                key={item.id}
                item={item}
                index={index}
                focus={focus}
                motionEnabled={motionEnabled}
              />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
