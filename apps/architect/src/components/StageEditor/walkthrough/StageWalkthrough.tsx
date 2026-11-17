import { Minus } from 'lucide-react';
import {
  animate,
  AnimatePresence,
  motion,
  useDragControls,
  useMotionValue,
  useTransform,
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
  type RefObject,
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
/** How the panel moves to a new place: slowly, easing in and out. */
const GLIDE = {
  type: 'tween',
  duration: 0.6,
  ease: [0.65, 0, 0.35, 1],
} as const;
/** How the panel grows or shrinks to a new step's height. */
const RESIZE = {
  type: 'tween',
  duration: 0.35,
  ease: [0.33, 1, 0.68, 1],
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

  const target = useStepTarget(sectionId, step?.field);
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

  useEffect(() => {
    target?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'center',
    });
  }, [reducedMotion, target]);

  const [navBar] = useState(() =>
    document.querySelector<HTMLElement>('header'),
  );
  const clearOfNav = Math.max(0, useRect(navBar)?.bottom ?? 0);
  // A new step starts at its top, not where the last one was scrolled to.
  const body = useRef<HTMLElement>(null);
  const toTop = (move: () => void) => () => {
    body.current?.scrollTo({ top: 0 });
    move();
  };
  const {
    card,
    bounds,
    dragControls,
    x,
    y,
    maxHeight,
    settle,
    startDrag,
    placeBeside,
  } = useMovablePanel(clearOfNav, reducedMotion);
  const { surfaceRef, headerRef, contentRef, footerRef, height, finalHeight } =
    usePanelHeight(body, bounds, reducedMotion);

  // Once the step's target has scrolled into place, the panel moves beside it,
  // and stays there as the step's height settles.
  const anchor = target;
  const [settled, setSettled] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (anchor === null) return undefined;
    // Placed once the page has stopped scrolling the target into view.
    let timer = window.setTimeout(() => setSettled(anchor), SCROLL_QUIET_MS);
    const restart = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setSettled(anchor), SCROLL_QUIET_MS);
    };
    window.addEventListener('scroll', restart, {
      capture: true,
      passive: true,
    });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', restart, { capture: true });
    };
  }, [anchor]);
  useEffect(() => {
    if (settled === null || settled !== anchor) return;
    placeBeside(settled, finalHeight);
  }, [anchor, finalHeight, placeBeside, settled]);
  const Scene = step.scene === undefined ? undefined : SCENES[step.scene];

  return (
    <>
      {target !== null && (
        <Spotlight target={target} reducedMotion={reducedMotion} />
      )}
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
        style={{ x, y, maxHeight }}
        className="pointer-events-auto fixed inset-e-6 top-0 flex w-[min(30rem,calc(100vw-3rem))] flex-col"
      >
        <MotionSurface
          ref={surfaceRef}
          as="section"
          aria-labelledby={headingId}
          floating
          shadow="none"
          spacing="none"
          noContainer
          onKeyDown={closeOnEscape}
          className="effect-shadow-lg flex min-h-0 w-full flex-col overflow-hidden"
          style={{
            height: finalHeight === undefined ? undefined : height,
          }}
          initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={SPRING}
        >
          <header
            ref={headerRef}
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
            ref={body}
            viewportClassName="flex flex-col gap-4 px-5 pt-6 pb-4"
          >
            <div ref={contentRef}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${step.title}-${index}`}
                  className="flex flex-col gap-4"
                  initial={reducedMotion ? false : { opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -24 }}
                  transition={SPRING}
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
            ref={footerRef}
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

/**
 * How long the page must go without scrolling before the step's target is
 * taken to be in place.
 */
const SCROLL_QUIET_MS = 150;

/**
 * Lets the researcher move the panel out of the way by dragging its header. It
 * stays inside `bounds`, which keep clear of the navigation bar and the
 * toolbar, moves beside what each step points at, and keeps where it was put
 * when it remounts after being minimised. It opens in the corner above the
 * toolbar.
 */
function useMovablePanel(clearOfNav: number, reducedMotion: boolean) {
  const card = useRef<HTMLDivElement>(null);
  const bounds = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const start = getWalkthroughPosition();
  const x = useMotionValue(start?.x ?? 0);
  const y = useMotionValue(start?.y ?? 0);
  const nav = useMotionValue(clearOfNav);
  useEffect(() => nav.set(clearOfNav), [clearOfNav, nav]);
  // No taller than `bounds`, the room between the navigation bar and the
  // toolbar. Moving the panel never changes its size.
  const maxHeight = useTransform(
    nav,
    (top) => `calc(100dvh - ${top}px - 6.75rem)`,
  );

  // Set once `moveBy` exists, which calls it after a glide.
  const fit = useRef(() => {});
  /** Puts the panel at `toX`, `toY`, gliding there if `animated`. */
  const goTo = useCallback(
    (toX: number, toY: number, animated: boolean) => {
      setWalkthroughPosition({ x: toX, y: toY });
      if (toX === x.get() && toY === y.get()) return;
      if (animated && !reducedMotion) {
        void animate(x, toX, GLIDE);
        // The panel may have changed height on the way.
        void animate(y, toY, GLIDE).finished.then(() => fit.current());
      } else {
        x.set(toX);
        y.set(toY);
      }
    },
    [reducedMotion, x, y],
  );

  /** Moves the panel by `dx`, `dy`, as far as `bounds` allow. */
  const moveBy = useCallback(
    (dx: number, dy: number, { animated = false } = {}) => {
      const rect = card.current?.getBoundingClientRect();
      const room = bounds.current?.getBoundingClientRect();
      if (rect === undefined || room === undefined) return;
      // The top edge wins when the panel cannot fit, so it never goes under
      // the navigation bar.
      goTo(
        x.get() +
          Math.max(
            Math.min(dx, room.right - rect.right),
            room.left - rect.left,
          ),
        y.get() +
          Math.max(
            Math.min(dy, room.bottom - rect.bottom),
            room.top - rect.top,
          ),
        animated,
      );
    },
    [goTo, x, y],
  );

  // A glide cut short by another one finishes too, so only once nothing is
  // still moving the panel.
  useEffect(() => {
    fit.current = () => {
      if (!x.isAnimating() && !y.isAnimating()) moveBy(0, 0);
    };
  }, [moveBy, x, y]);

  // A drag is free to leave `bounds` (constraining it to them would also pull
  // the panel back toward where it was every time its height changes), so the
  // panel eases back inside them when it is let go.
  const settle = useCallback(() => moveBy(0, 0, { animated: true }), [moveBy]);

  // Opening for the first time, the panel goes to the bottom of its room.
  const placed = useRef(start !== undefined);
  useLayoutEffect(() => {
    if (placed.current) return;
    placed.current = true;
    moveBy(0, Number.POSITIVE_INFINITY);
  }, [moveBy]);

  // A taller step must not push the panel past the toolbar: the panel moves
  // up to fit instead.
  useEffect(() => {
    const element = card.current;
    if (element === null) return undefined;
    // Not while it glides somewhere: a step that gets shorter as the panel
    // moves can overhang its room for a moment on the way.
    const observer = new ResizeObserver(() => {
      if (!x.isAnimating() && !y.isAnimating()) moveBy(0, 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [moveBy, x, y]);

  const startDrag = useCallback(
    (event: ReactPointerEvent) => {
      const from = event.target instanceof Element ? event.target : null;
      if (from?.closest('button, a') != null) return;
      // Otherwise moving the pointer across the page selects its text.
      event.preventDefault();
      dragControls.start(event);
    },
    [dragControls],
  );

  /**
   * Moves the panel beside `element`, `PANEL_GAP` away from it, on whichever
   * side leaves the most room. Where no side has room for the whole panel it
   * gets as close as `bounds` allow. `height` is the height the panel is
   * growing or shrinking to, if it is not that height yet.
   */
  const placeBeside = useCallback(
    (element: HTMLElement, height?: number) => {
      const rect = card.current?.getBoundingClientRect();
      const room = bounds.current?.getBoundingClientRect();
      if (rect === undefined || room === undefined) return;
      const { width } = rect;
      const tall = height ?? rect.height;
      const target = element.getBoundingClientRect();
      // How much room each side leaves once the panel is there.
      const sides = [
        { side: 'left', spare: target.left - room.left - width },
        { side: 'right', spare: room.right - target.right - width },
        { side: 'above', spare: target.top - room.top - tall },
        { side: 'below', spare: room.bottom - target.bottom - tall },
      ] as const;
      const { side } = sides.reduce((best, next) =>
        next.spare > best.spare ? next : best,
      );
      // Beside the target the panel lines up with its top; above or below,
      // with its middle.
      const left =
        side === 'left'
          ? target.left - PANEL_GAP - width
          : side === 'right'
            ? target.right + PANEL_GAP
            : target.left + (target.width - width) / 2;
      const top =
        side === 'above'
          ? target.top - PANEL_GAP - tall
          : side === 'below'
            ? target.bottom + PANEL_GAP
            : target.top;
      const toLeft = Math.min(Math.max(left, room.left), room.right - width);
      const toTop = Math.min(Math.max(top, room.top), room.bottom - tall);
      // Kept inside `bounds` at the height it is heading for, not the height it
      // is at, which `moveBy` would use.
      goTo(x.get() + toLeft - rect.left, y.get() + toTop - rect.top, true);
    },
    [goTo, x, y],
  );

  return {
    card,
    bounds,
    dragControls,
    x,
    y,
    maxHeight,
    settle,
    startDrag,
    placeBeside,
  };
}

/**
 * Sizes the panel to fit the step on screen, up to the height of `bounds`,
 * and animates between steps' heights. Beyond that height the step scrolls.
 */
function usePanelHeight(
  viewport: RefObject<HTMLElement | null>,
  bounds: RefObject<HTMLDivElement | null>,
  reducedMotion: boolean,
) {
  const surface = useRef<HTMLElement>(null);
  const header = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const footer = useRef<HTMLElement>(null);
  const height = useMotionValue(0);
  const [finalHeight, setFinalHeight] = useState<number>();

  useLayoutEffect(() => {
    const parts = [surface, header, content, footer, viewport, bounds];
    const measure = () => {
      const [s, h, c, f, v, b] = parts.map((part) => part.current);
      if (!s || !h || !c || !f || !v || !b) return;
      const padding = getComputedStyle(v);
      // The step's whole height, borders and all: what the panel would be with
      // nothing to scroll.
      const natural =
        s.offsetHeight -
        s.clientHeight +
        h.offsetHeight +
        f.offsetHeight +
        c.offsetHeight +
        Number.parseFloat(padding.paddingTop) +
        Number.parseFloat(padding.paddingBottom);
      setFinalHeight(
        Math.min(
          Math.ceil(natural),
          Math.floor(b.getBoundingClientRect().height),
        ),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const part of [header, content, footer, bounds]) {
      if (part.current !== null) observer.observe(part.current);
    }
    return () => observer.disconnect();
  }, [bounds, viewport]);

  const sized = useRef(false);
  useLayoutEffect(() => {
    if (finalHeight === undefined) return undefined;
    if (!sized.current || reducedMotion) {
      sized.current = true;
      height.jump(finalHeight);
      return undefined;
    }
    const controls = animate(height, finalHeight, RESIZE);
    return () => controls.stop();
  }, [finalHeight, height, reducedMotion]);

  return {
    surfaceRef: surface,
    headerRef: header,
    contentRef: content,
    footerRef: footer,
    height,
    finalHeight,
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

/** The element a step points at: a section, or a field inside it. */
function useStepTarget(
  sectionId: string | undefined,
  field: string | undefined,
): HTMLElement | null {
  const getSnapshot = useCallback(() => {
    if (sectionId === undefined) return null;
    const section = document.getElementById(sectionId);
    if (section === null || field === undefined) return section;
    return (
      section.querySelector<HTMLElement>(
        `[data-field-name="${CSS.escape(field)}"]`,
      ) ?? section
    );
  }, [field, sectionId]);

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

const SPOTLIGHT_INSET = 8;

function Spotlight({
  target,
  reducedMotion,
}: Readonly<{ target: HTMLElement; reducedMotion: boolean }>) {
  const rect = useRect(target);
  if (rect === null) return null;

  return (
    <motion.div
      aria-hidden
      className="ring-warning fixed rounded ring-4"
      // Inline: the portal layer re-enables pointer events on its children,
      // and a ring that caught clicks would block the control it points at.
      style={{ pointerEvents: 'none' }}
      initial={false}
      animate={{
        top: rect.top - SPOTLIGHT_INSET,
        left: rect.left - SPOTLIGHT_INSET,
        width: rect.width + SPOTLIGHT_INSET * 2,
        height: rect.height + SPOTLIGHT_INSET * 2,
      }}
      transition={reducedMotion ? { duration: 0 } : SPRING}
    />
  );
}
