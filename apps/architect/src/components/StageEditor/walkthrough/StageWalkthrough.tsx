import { Minus } from 'lucide-react';
import {
  animate,
  AnimatePresence,
  motion,
  useDragControls,
  useMotionValue,
  type MotionValue,
} from 'motion/react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button, IconButton } from '@codaco/fresco-ui/Button';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import { usePortalContainer } from '@codaco/fresco-ui/PortalContainer';
import ProgressRing from '@codaco/fresco-ui/ProgressRing';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Eyebrow from '@codaco/fresco-ui/typography/Eyebrow';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { StageSectionsStore } from '@codaco/protocol-builder/stage-editor-contract';
import { useStageEdit } from '@codaco/protocol-builder/stageEdit';

import {
  walkthroughFor,
  type Walkthrough,
  type WalkthroughBlock,
  type WalkthroughStep,
} from './parseWalkthrough';
import Practices from './Practices';
import { SCENES } from './scenes/sceneRegistry';
import {
  closeWalkthrough,
  getWalkthroughPosition,
  goToWalkthroughStep,
  setWalkthroughCollapsed,
  setWalkthroughPosition,
  setWalkthroughSection,
  takeWalkthroughFocus,
  useWalkthroughState,
} from './walkthroughStore';

const messages = defineMessages({
  back: {
    id: 'architect.stageEditor.walkthrough.back',
    defaultMessage: 'Back',
    description: 'Button that returns to the previous walkthrough step.',
  },
  next: {
    id: 'architect.stageEditor.walkthrough.next',
    defaultMessage: 'Next',
    description: 'Button that moves to the next walkthrough step.',
  },
  finish: {
    id: 'architect.stageEditor.walkthrough.finish',
    defaultMessage: 'Finish',
    description: 'Button on the last walkthrough step that closes it.',
  },
  walkthrough: {
    id: 'architect.stageEditor.walkthrough.eyebrow',
    defaultMessage: 'Walkthrough',
    description:
      'Small label above the name of the stage type at the top of the walkthrough, and on the minimized walkthrough.',
  },
  progressShort: {
    id: 'architect.stageEditor.walkthrough.progressShort',
    defaultMessage: '{index, number}/{total, number}',
    description:
      'Compact step count inside the progress ring of the minimized walkthrough, e.g. "1/8". index is one-based.',
  },
  collapse: {
    id: 'architect.stageEditor.walkthrough.collapse',
    defaultMessage: 'Hide the walkthrough for now',
    description:
      'Button that folds the walkthrough panel down to a small bar, so the researcher can work on the page behind it.',
  },
});

const MARKDOWN_TAGS = [...ALLOWED_MARKDOWN_SECTION_TAGS, 'img', 'code'];

const SPRING = { type: 'spring', duration: 0.4, bounce: 0 } as const;
/**
 * How long a step change takes. Everything it moves (the page's scroll, the
 * panel's place and height, the highlight and the step's text) moves together
 * over this time, on the same easing.
 */
const STEP_SECONDS = 0.5;
const STEP = {
  type: 'tween',
  duration: STEP_SECONDS,
  ease: [0.65, 0, 0.35, 1],
} as const;
/** The old step's text fades out over the first half of a step change… */
const TEXT_OUT = { duration: STEP_SECONDS / 2, ease: 'easeIn' } as const;
/** …and the new step's over the second half. */
const TEXT_IN = {
  duration: STEP_SECONDS / 2,
  delay: STEP_SECONDS / 2,
  ease: 'easeOut',
} as const;
/** The space kept between the panel and the section it sits beside. */
const PANEL_GAP = 24;

export function useStageWalkthrough(): Walkthrough | undefined {
  const { identity } = useStageEdit();
  return identity === undefined ? undefined : walkthroughFor(identity.type);
}

/** A guide to the stage being edited, in a panel floating over the editor. */
export default function StageWalkthrough({
  sections,
}: Readonly<{ sections: StageSectionsStore }>) {
  const walkthrough = useStageWalkthrough();
  const { open } = useWalkthroughState();
  const portalContainer = usePortalContainer();

  useEffect(() => () => closeWalkthrough({ restoreFocus: false }), []);

  if (!open || walkthrough === undefined) return null;

  return createPortal(
    <WalkthroughPanel
      title={walkthrough.title}
      sections={sections}
      steps={walkthrough.steps}
    />,
    portalContainer ?? document.body,
  );
}

function WalkthroughPanel({
  title,
  sections,
  steps,
}: Readonly<{
  title: string;
  sections: StageSectionsStore;
  steps: readonly WalkthroughStep[];
}>) {
  const { step: current, collapsed } = useWalkthroughState();

  const entries = useSyncExternalStore(
    sections.subscribe,
    sections.getSnapshot,
    sections.getServerSnapshot,
  );

  const index = Math.min(current, steps.length - 1);
  const step = steps[index];

  const sectionId =
    step?.section === undefined
      ? undefined
      : entries.find(
          (entry) => entry.title.toLowerCase() === step.section?.toLowerCase(),
        )?.id;
  useEffect(() => {
    setWalkthroughSection(collapsed ? undefined : sectionId);
    return () => setWalkthroughSection(undefined);
  }, [collapsed, sectionId]);

  const target = useStepTarget(sectionId, step?.field, step?.control);
  const isLast = index === steps.length - 1;

  // Minimised, the walkthrough sits in the editor's toolbar instead.
  if (step === undefined || collapsed) return null;

  return (
    <WalkthroughCard
      title={title}
      step={step}
      index={index}
      total={steps.length}
      target={target}
      onBack={index === 0 ? undefined : () => goToWalkthroughStep(index - 1)}
      onNext={
        isLast
          ? () => closeWalkthrough({ finished: true })
          : () => goToWalkthroughStep(index + 1)
      }
      isLast={isLast}
    />
  );
}

/** How far through the walkthrough the researcher is, as "3/18" in a ring. */
export function StepRing({
  index,
  total,
}: Readonly<{ index: number; total: number }>) {
  const intl = useAppIntl();
  return (
    <ProgressRing value={(index + 1) / total} className="size-10 shrink-0">
      <span className="sr-only" lang="en">
        {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx -- screen-reader text */}
        {`Step ${index + 1} of ${total}`}
      </span>
      <span aria-hidden className="font-heading text-2xs font-extrabold">
        {intl.formatMessage(messages.progressShort, {
          index: index + 1,
          total,
        })}
      </span>
    </ProgressRing>
  );
}

/**
 * One segment per step, filled up to the step the researcher is on. Hidden
 * from assistive technology, which is told the same position in words.
 */
function StepSegments({
  index,
  total,
}: Readonly<{ index: number; total: number }>) {
  return (
    <div aria-hidden className="flex min-w-0 gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cx(
            'spring-short h-1 flex-1 rounded-full',
            i <= index ? 'bg-primary' : 'bg-current/10',
          )}
        />
      ))}
    </div>
  );
}

/**
 * The walkthrough as a card floating in the corner above the action bar, as
 * tall as its step; the footer is pinned and long copy scrolls in the body.
 */
function WalkthroughCard({
  title,
  step,
  index,
  total,
  target,
  onBack,
  onNext,
  isLast,
}: Readonly<{
  title: string;
  step: WalkthroughStep;
  index: number;
  total: number;
  target: HTMLElement | null;
  onBack: (() => void) | undefined;
  onNext: () => void;
  isLast: boolean;
}>) {
  const intl = useAppIntl();
  const headingId = useId();
  const nextRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = usePrefersReducedMotion() === true;
  const { focusRequest } = useWalkthroughState();

  // On mount, and whenever the researcher asks for the panel again.
  const focusedFor = useRef<number | null>(null);
  useEffect(() => {
    if (focusedFor.current === focusRequest) return;
    focusedFor.current = focusRequest;
    if (takeWalkthroughFocus()) nextRef.current?.focus({ preventScroll: true });
  }, [focusRequest]);

  const [navBar] = useState(() =>
    document.querySelector<HTMLElement>('header'),
  );
  const clearOfNav = Math.max(0, useRect(navBar)?.bottom ?? 0);
  const {
    card,
    bounds,
    surface,
    header,
    viewport,
    content,
    footer,
    dragControls,
    x,
    y,
    height,
    sized,
    ring,
    startDrag,
    settle,
    showStep,
  } = usePanel(target, reducedMotion);
  // A new step starts at its top, not where the last one was scrolled to.
  const toTop = (move: () => void) => () => {
    viewport.current?.scrollTo({ top: 0 });
    move();
  };

  // The new step's text is in place (the old one fades out over it), so
  // everything a step change moves is planned from its height. Only a new
  // step, or its section appearing, starts a change.
  const latestShowStep = useRef(showStep);
  useLayoutEffect(() => {
    latestShowStep.current = showStep;
  }, [showStep]);
  useLayoutEffect(() => {
    latestShowStep.current(target);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- a new step about the same section is still a step change, with its own height
  }, [index, target]);
  const Scene = step.scene === undefined ? undefined : SCENES[step.scene];

  return (
    <>
      <motion.div
        aria-hidden
        className="ring-warning fixed rounded ring-4"
        // Inline: the portal layer re-enables pointer events on its children,
        // and a ring that caught clicks would block the control it points at.
        style={{
          pointerEvents: 'none',
          top: ring.top,
          left: ring.left,
          width: ring.width,
          height: ring.height,
          opacity: ring.opacity,
        }}
      />
      <div
        ref={bounds}
        aria-hidden
        className="fixed inset-x-3 bottom-24"
        style={{ pointerEvents: 'none', top: clearOfNav + 12 }}
      />
      <motion.div
        ref={card}
        drag
        dragListener={false}
        dragControls={dragControls}
        dragMomentum={false}
        onDragEnd={settle}
        style={{ x, y, maxHeight: `calc(100dvh - ${clearOfNav}px - 6.75rem)` }}
        className="pointer-events-auto fixed inset-e-6 top-0 flex w-[min(30rem,calc(100vw-3rem))] flex-col"
      >
        <MotionSurface
          ref={surface}
          as="section"
          aria-labelledby={headingId}
          floating
          shadow="none"
          spacing="none"
          noContainer
          onKeyDown={closeOnEscape}
          className="effect-shadow-lg flex min-h-0 w-full flex-col overflow-hidden"
          style={{ height: sized ? height : undefined }}
          initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={SPRING}
        >
          <header
            ref={header}
            onPointerDown={startDrag}
            className="flex shrink-0 cursor-grab touch-none flex-col px-5 pt-4 select-none active:cursor-grabbing"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <Eyebrow>{intl.formatMessage(messages.walkthrough)}</Eyebrow>
                <span className="font-heading truncate text-sm font-bold">
                  {title}
                </span>
              </div>
              <div className="-me-2 flex shrink-0 items-center">
                <IconButton
                  size="sm"
                  variant="text"
                  color="dynamic"
                  icon={<Minus />}
                  title={intl.formatMessage(messages.collapse)}
                  aria-label={intl.formatMessage(messages.collapse)}
                  onClick={() => setWalkthroughCollapsed(true)}
                />
                <CloseButton size="sm" onClick={() => closeWalkthrough()} />
              </div>
            </div>
          </header>
          <ScrollArea
            ref={viewport}
            viewportClassName="flex flex-col gap-4 px-5 pt-6 pb-4"
          >
            <div ref={content} className="relative">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={`${step.title}-${index}`}
                  className="flex flex-col gap-4"
                  initial={reducedMotion ? false : { opacity: 0, x: 12 }}
                  animate={{
                    opacity: 1,
                    x: 0,
                    transition: reducedMotion ? { duration: 0 } : TEXT_IN,
                  }}
                  exit={{
                    opacity: 0,
                    x: reducedMotion ? 0 : -12,
                    transition: reducedMotion ? { duration: 0 } : TEXT_OUT,
                  }}
                >
                  {Scene !== undefined && (
                    <div className="w-full shrink-0">
                      <Scene />
                    </div>
                  )}
                  <div aria-live="polite" className="flex flex-col gap-3">
                    <Heading id={headingId} level="h4" margin="none">
                      {step.title}
                    </Heading>
                    {step.blocks.map((block, i) => (
                      <Block key={i} block={block} />
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </ScrollArea>
          <footer
            ref={footer}
            className="grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-3"
          >
            <div>
              <Button
                variant="text"
                size="sm"
                disabled={onBack === undefined}
                onClick={onBack === undefined ? undefined : toTop(onBack)}
              >
                {intl.formatMessage(messages.back)}
              </Button>
            </div>
            <StepSegments index={index} total={total} />
            <span className="sr-only" lang="en">
              {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx -- screen-reader text */}
              {`Step ${index + 1} of ${total}`}
            </span>
            <div className="flex justify-end">
              <Button
                ref={nextRef}
                color="primary"
                size="sm"
                onClick={toTop(onNext)}
              >
                {intl.formatMessage(isLast ? messages.finish : messages.next)}
              </Button>
            </div>
          </footer>
        </MotionSurface>
      </motion.div>
    </>
  );
}

function Block({ block }: Readonly<{ block: WalkthroughBlock }>) {
  if (block.kind === 'practices') return <Practices items={block.items} />;
  return (
    <RenderMarkdown allowedElements={MARKDOWN_TAGS} render={<div />}>
      {block.text}
    </RenderMarkdown>
  );
}

/** How far the highlight ring sits outside what it rings. */
const RING_INSET = 8;

type Box = Readonly<{
  top: number;
  left: number;
  width: number;
  height: number;
}>;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/** Whether `element` sits in a fixed box, which the page scrolls past. */
function isFixed(element: HTMLElement): boolean {
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    if (getComputedStyle(node).position === 'fixed') return true;
  }
  return false;
}

/** The element that scrolls `element` into view: its nearest scrolling box. */
function scrollerOf(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (
      /auto|scroll|overlay/.test(overflowY) &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
  }
  return document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : document.documentElement;
}

/**
 * Where the panel goes beside `target`, `PANEL_GAP` away from it, on whichever
 * side leaves the most room: lined up with its top beside it, or with its
 * middle above or below it. Where no side has room for the whole panel it
 * gets as close as `room` allows.
 */
function besideTarget(target: Box, room: DOMRect, width: number, tall: number) {
  const sides = [
    { side: 'left', spare: target.left - room.left - width },
    {
      side: 'right',
      spare: room.right - (target.left + target.width) - width,
    },
    { side: 'above', spare: target.top - room.top - tall },
    { side: 'below', spare: room.bottom - (target.top + target.height) - tall },
  ] as const;
  const { side } = sides.reduce((best, next) =>
    next.spare > best.spare ? next : best,
  );
  const left =
    side === 'left'
      ? target.left - PANEL_GAP - width
      : side === 'right'
        ? target.left + target.width + PANEL_GAP
        : target.left + (target.width - width) / 2;
  const top =
    side === 'above'
      ? target.top - PANEL_GAP - tall
      : side === 'below'
        ? target.top + target.height + PANEL_GAP
        : target.top;
  return { left, top };
}

/**
 * The floating panel's place, size and highlight ring, and how a step change
 * moves them.
 *
 * The panel keeps its bottom edge, where Back and Next are, still: a step of a
 * different height changes it at the top. It stays inside `bounds`, which keep
 * clear of the navigation bar and the toolbar, opens in the corner above the
 * toolbar, and can be dragged anywhere by its header.
 *
 * A step about a different section scrolls that section into the middle of
 * the room and moves the panel beside it. Everything a step change moves is
 * worked out first and then animated together, with `STEP`: the page's
 * scroll, the panel's place and height, and the ring, which therefore stays
 * on its section while the page scrolls under it.
 */
function usePanel(target: HTMLElement | null, reducedMotion: boolean) {
  const card = useRef<HTMLDivElement>(null);
  const bounds = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLElement>(null);
  const header = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const footer = useRef<HTMLElement>(null);
  const dragControls = useDragControls();

  const start = getWalkthroughPosition();
  const x = useMotionValue(start?.x ?? 0);
  const y = useMotionValue(start?.y ?? 0);
  const height = useMotionValue(0);
  const [sized, setSized] = useState(false);
  const ringTop = useMotionValue(0);
  const ringLeft = useMotionValue(0);
  const ringWidth = useMotionValue(0);
  const ringHeight = useMotionValue(0);
  const ringOpacity = useMotionValue(0);

  // Read by callbacks that outlive a render.
  const targetNow = useRef(target);
  useLayoutEffect(() => {
    targetNow.current = target;
  }, [target]);
  /** The panel has a place: until then it goes to the corner. */
  const positioned = useRef(start !== undefined);
  /** The section the panel was last put beside. */
  const besideOf = useRef<HTMLElement | null>(null);
  /** Counts step changes, so only the latest one finishes. */
  const changes = useRef(0);
  const moving = useRef(false);
  const scrolling = useRef<ReturnType<typeof animate> | null>(null);

  /** The step's whole height, borders and all: the panel with nothing to scroll. */
  const naturalHeight = useCallback(() => {
    const parts = [surface, header, content, footer, viewport].map(
      (part) => part.current,
    );
    const [s, h, c, f, v] = parts;
    if (!s || !h || !c || !f || !v) return undefined;
    const padding = getComputedStyle(v);
    return Math.ceil(
      s.offsetHeight -
        s.clientHeight +
        h.offsetHeight +
        f.offsetHeight +
        c.offsetHeight +
        Number.parseFloat(padding.paddingTop) +
        Number.parseFloat(padding.paddingBottom),
    );
  }, []);

  const setRing = useCallback(
    (box: Box) => {
      ringTop.set(box.top - RING_INSET);
      ringLeft.set(box.left - RING_INSET);
      ringWidth.set(box.width + RING_INSET * 2);
      ringHeight.set(box.height + RING_INSET * 2);
    },
    [ringHeight, ringLeft, ringTop, ringWidth],
  );

  /**
   * Moves the panel to `left`, `top` (kept inside `bounds`) at `tall`, and
   * the page and ring as given, all together. Returns when it is all there.
   */
  const moveTogether = useCallback(
    (
      plan: Readonly<{
        left: number;
        top: number;
        tall: number;
        scroll?: Readonly<{ scroller: HTMLElement; to: number }>;
        ring?: Readonly<{ from: Box | null; to: Box | null }>;
      }>,
      animated: boolean,
    ) => {
      const rect = card.current?.getBoundingClientRect();
      const room = bounds.current?.getBoundingClientRect();
      if (rect === undefined || room === undefined) return Promise.resolve();
      const tall = Math.min(plan.tall, Math.floor(room.height));
      const left = clamp(plan.left, room.left, room.right - rect.width);
      const top = clamp(plan.top, room.top, room.bottom - tall);
      const toX = x.get() + left - rect.left;
      const toY = y.get() + top - rect.top;
      setWalkthroughPosition({ x: toX, y: toY });

      const finished: Promise<unknown>[] = [];
      const go = (value: MotionValue<number>, to: number) => {
        if (animated) finished.push(animate(value, to, STEP).finished);
        else value.jump(to);
      };
      go(x, toX);
      go(y, toY);
      // The first sizing is not a change, so it is not animated.
      if (sized) go(height, tall);
      else height.jump(tall);

      scrolling.current?.stop();
      scrolling.current = null;
      if (plan.scroll !== undefined) {
        const { scroller, to } = plan.scroll;
        if (animated) {
          const scroll = animate(scroller.scrollTop, to, {
            ...STEP,
            onUpdate: (value) => {
              scroller.scrollTop = value;
            },
          });
          scrolling.current = scroll;
          finished.push(scroll.finished);
        } else {
          scroller.scrollTop = to;
        }
      }

      if (plan.ring !== undefined) {
        const { from, to } = plan.ring;
        if (to === null) {
          go(ringOpacity, 0);
        } else {
          // A ring that was hidden starts on its section, so it rides along
          // with the scroll rather than flying in from the last one.
          if (ringOpacity.get() === 0 && from !== null) setRing(from);
          go(ringTop, to.top - RING_INSET);
          go(ringLeft, to.left - RING_INSET);
          go(ringWidth, to.width + RING_INSET * 2);
          go(ringHeight, to.height + RING_INSET * 2);
          go(ringOpacity, 1);
        }
      }
      return Promise.all(finished);
    },
    [
      ringHeight,
      ringLeft,
      ringOpacity,
      ringTop,
      ringWidth,
      setRing,
      sized,
      height,
      x,
      y,
    ],
  );

  /** Runs one change and marks the panel as moving until the latest is done. */
  const change = useCallback(
    (run: (animated: boolean) => Promise<unknown>) => {
      const animated = !reducedMotion && positioned.current;
      const id = ++changes.current;
      moving.current = true;
      void run(animated).finally(() => {
        if (changes.current === id) moving.current = false;
      });
    },
    [reducedMotion],
  );

  /** Takes the step on screen: its height, and `section`, if it is about one. */
  const showStep = useCallback(
    (section: HTMLElement | null) => {
      const rect = card.current?.getBoundingClientRect();
      const room = bounds.current?.getBoundingClientRect();
      const tall = naturalHeight();
      if (rect === undefined || room === undefined || tall === undefined) {
        return;
      }
      const toTall = Math.min(tall, Math.floor(room.height));

      // Keep the bottom where it is; on first opening, in the corner.
      let left = rect.left;
      let top = positioned.current
        ? rect.bottom - toTall
        : room.bottom - toTall;
      let scroll: { scroller: HTMLElement; to: number } | undefined;
      let ring: { from: Box | null; to: Box | null } = { from: null, to: null };

      if (section !== null) {
        const now = section.getBoundingClientRect();
        // Into the middle of the room the panel leaves visible, or, for a
        // section taller than that, with its top at the top of the room.
        // A control on a fixed bar, such as the toolbar, is always in view.
        const scroller = isFixed(section) ? null : scrollerOf(section);
        const want =
          now.height > room.height
            ? room.top
            : room.top + (room.height - now.height) / 2;
        const to =
          scroller === null
            ? 0
            : clamp(
                scroller.scrollTop + now.top - want,
                0,
                scroller.scrollHeight - scroller.clientHeight,
              );
        const by = scroller === null ? 0 : to - scroller.scrollTop;
        if (scroller !== null && by !== 0) scroll = { scroller, to };
        const there = {
          top: now.top - by,
          left: now.left,
          width: now.width,
          height: now.height,
        };
        ring = { from: now, to: there };
        // Another step about the same section leaves the panel where it is.
        if (besideOf.current !== section) {
          ({ left, top } = besideTarget(there, room, rect.width, toTall));
          besideOf.current = section;
        }
      } else {
        besideOf.current = null;
      }

      change((animated) =>
        moveTogether({ left, top, tall: toTall, scroll, ring }, animated),
      );
      positioned.current = true;
      if (!sized) setSized(true);
    },
    [change, moveTogether, naturalHeight, sized],
  );

  /**
   * Keeps the panel fitted and placed as its step, its section or the window
   * changes size, and the ring on its section as the page moves. Not during a
   * step change, which has already planned for all of it.
   */
  useEffect(() => {
    /** The panel's height for the step on screen, and its room. */
    const measure = () => {
      const rect = card.current?.getBoundingClientRect();
      const room = bounds.current?.getBoundingClientRect();
      const tall = naturalHeight();
      if (rect === undefined || room === undefined || tall === undefined) {
        return undefined;
      }
      return { rect, room, tall: Math.min(tall, Math.floor(room.height)) };
    };
    /**
     * Keeps the panel beside its section as the window or the section
     * changes size, moving to another side if that one has more room now.
     * Straight there, so it stays with the section while the window is
     * dragged to a new size.
     */
    const reanchor = () => {
      const section = targetNow.current;
      if (moving.current || section === null) return false;
      if (besideOf.current !== section) return false;
      const now = measure();
      if (now === undefined) return false;
      const spot = besideTarget(
        section.getBoundingClientRect(),
        now.room,
        now.rect.width,
        now.tall,
      );
      void moveTogether({ ...spot, tall: now.tall }, false);
      return true;
    };
    /**
     * Fits a panel that is not beside a section to a change in its step's
     * height or in its room, with the bottom kept still.
     */
    const refit = () => {
      if (moving.current) return;
      const now = measure();
      if (now === undefined) return;
      const { rect, room, tall } = now;
      const inside =
        rect.left >= room.left &&
        rect.right <= room.right &&
        rect.top - (tall - rect.height) >= room.top &&
        rect.bottom <= room.bottom;
      if (tall === Math.round(height.get()) && inside) return;
      change((animated) =>
        moveTogether(
          { left: rect.left, top: rect.bottom - tall, tall },
          // A change of room is the window being resized: keep up with it.
          animated && tall !== Math.round(height.get()),
        ),
      );
    };
    const follow = () => {
      const section = targetNow.current;
      if (moving.current || section === null) return;
      setRing(section.getBoundingClientRect());
    };
    // The window or the section changing size re-places the panel beside
    // the section; the step's own height changing keeps the bottom still.
    const fit = () => {
      if (!reanchor()) refit();
      follow();
    };
    const steps = new ResizeObserver(() => {
      refit();
      follow();
    });
    for (const part of [header, content, footer]) {
      if (part.current !== null) steps.observe(part.current);
    }
    const observer = new ResizeObserver(fit);
    if (bounds.current !== null) observer.observe(bounds.current);
    if (target !== null) observer.observe(target);
    window.addEventListener('scroll', follow, { capture: true, passive: true });
    window.addEventListener('resize', fit);
    return () => {
      steps.disconnect();
      observer.disconnect();
      window.removeEventListener('scroll', follow, { capture: true });
      window.removeEventListener('resize', fit);
    };
  }, [change, height, moveTogether, naturalHeight, setRing, target]);

  // Stops scrolling the page once the panel goes.
  useEffect(() => () => scrolling.current?.stop(), []);

  const startDrag = useCallback(
    (event: ReactPointerEvent) => {
      const from = event.target instanceof Element ? event.target : null;
      if (from?.closest('button, a') != null) return;
      // Otherwise moving the pointer across the page selects its text.
      event.preventDefault();
      // Put somewhere by hand, the panel stops following its section until
      // the next step about another one.
      besideOf.current = null;
      dragControls.start(event);
    },
    [dragControls],
  );

  // A drag is free to leave `bounds` (Motion's constraints would rescale the
  // panel's place on every change of height), so the panel eases back inside
  // them when it is let go.
  const settle = useCallback(() => {
    const rect = card.current?.getBoundingClientRect();
    if (rect === undefined) return;
    change((animated) =>
      moveTogether(
        { left: rect.left, top: rect.top, tall: height.get() },
        animated,
      ),
    );
  }, [change, height, moveTogether]);

  return {
    card,
    bounds,
    surface,
    header,
    viewport,
    content,
    footer,
    dragControls,
    x,
    y,
    height,
    sized,
    ring: {
      top: ringTop,
      left: ringLeft,
      width: ringWidth,
      height: ringHeight,
      opacity: ringOpacity,
    },
    startDrag,
    settle,
    showStep,
  };
}

/**
 * Where an element is on screen, kept current as it, the window, or anything
 * scrolling or animating around it changes.
 */
function useRect(element: HTMLElement | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (element === null) return undefined;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setRect(element.getBoundingClientRect()),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const events = ['scroll', 'transitionend', 'animationend'] as const;
    for (const event of events) window.addEventListener(event, measure, true);
    window.addEventListener('resize', measure);
    const settle = window.setTimeout(measure, 400);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      observer.disconnect();
      for (const event of events)
        window.removeEventListener(event, measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [element]);

  return rect;
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.stopPropagation();
  closeWalkthrough();
}

/**
 * The element a step points at: a section, a field inside it, or a control
 * outside the sections, such as the toolbar's Preview button.
 */
function useStepTarget(
  sectionId: string | undefined,
  field: string | undefined,
  control: string | undefined,
): HTMLElement | null {
  const getSnapshot = useCallback(() => {
    if (control !== undefined) {
      return document.querySelector<HTMLElement>(
        `[data-walkthrough-control="${CSS.escape(control)}"]`,
      );
    }
    if (sectionId === undefined) return null;
    const section = document.getElementById(sectionId);
    if (section === null || field === undefined) return section;
    return (
      section.querySelector<HTMLElement>(
        `[data-field-name="${CSS.escape(field)}"]`,
      ) ?? section
    );
  }, [control, field, sectionId]);

  return useSyncExternalStore(subscribeToPage, getSnapshot, () => null);
}

/** Calls back whenever the page's DOM changes. */
function subscribeToPage(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  return () => observer.disconnect();
}
