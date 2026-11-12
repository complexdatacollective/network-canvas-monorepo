'use client';

import { ArrowUpRight } from 'lucide-react';
import {
  motion,
  type MotionValue,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import { useTranslations } from 'next-intl';
import { type Ref, useId, useLayoutEffect, useRef } from 'react';

import useHasHydrated from '@codaco/fresco-ui/hooks/useHasHydrated';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { heroScrollSpring } from '~/components/ui/scrollDrivenMotion';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { principles } from '~/lib/content';

import {
  FORM_COLORS,
  scenePhase,
  smoothstep,
} from './designPrinciplesGeometry';
import { DesignPrinciplesScene } from './DesignPrinciplesScene';

// Design principles. Under a centred heading, each principle sits on a card
// beside one scene that the reader's scroll moves through: the network grows
// in as the first card arrives, and each later card moves the scene on by one
// form (see DesignPrinciplesScene). Each form holds while its card is read.

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
  blockRef,
}: {
  item: PrincipleCopy;
  index: number;
  focus: MotionValue<number>;
  motionEnabled: boolean;
  blockRef?: Ref<HTMLDivElement>;
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
      ref={blockRef}
      className="tablet-landscape:min-h-[80svh] tablet-landscape:py-10 flex min-h-[56svh] flex-col justify-center py-6"
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
                className="ms-1 inline-block size-[0.8em] -translate-y-[0.06em] opacity-50 group-hover/title:opacity-100"
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
  const firstCardRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef<Block[]>([]);
  const columnHeightRef = useRef(0);

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
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    return () => observer.disconnect();
  }, []);

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

  // How far the first card has come up to the reading line.
  const { scrollYProgress: entry } = useScroll({
    target: firstCardRef,
    offset: ['start 75%', 'start 58%'],
  });
  const phase = useTransform(() =>
    scenePhase(entry.get(), focus.get(), items.length),
  );
  const smoothPhase = useSpring(phase, heroScrollSpring);
  // The reading position, on the same spring: it draws the workflow's line
  // as its card is read.
  const smoothFocus = useSpring(focus, heroScrollSpring);
  // Reduced motion: the scene cuts straight to the form being read.
  const restingPhase = useTransform(phase, (p) => Math.round(p));

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
          <div className="tablet-landscape:col-span-8 tablet-landscape:col-start-1 tablet-landscape:row-start-1 tablet-landscape:mx-0 tablet-landscape:h-svh tablet-landscape:self-start tablet-landscape:z-0 tablet-landscape:items-center tablet-landscape:justify-end tablet-landscape:pe-[calc((100%-21rem)/8-2rem)] sticky top-0 z-10 -mx-6 flex h-[44svh]">
            <DesignPrinciplesScene
              key={motionEnabled ? 'scrubbed' : 'resting'}
              phase={motionEnabled ? smoothPhase : restingPhase}
              reading={motionEnabled ? smoothFocus : undefined}
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
                blockRef={index === 0 ? firstCardRef : undefined}
              />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
