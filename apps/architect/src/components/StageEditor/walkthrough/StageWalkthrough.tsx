import { Minus } from 'lucide-react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import {
  Suspense,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button, IconButton } from '@codaco/fresco-ui/Button';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import { usePortalContainer } from '@codaco/fresco-ui/PortalContainer';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Eyebrow from '@codaco/fresco-ui/typography/Eyebrow';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { useStageEdit } from '@codaco/protocol-builder/stageEdit';

import type { WalkthroughBlock, WalkthroughStep } from './parseWalkthrough';
import Practices from './Practices';
import SceneBoundary from './SceneBoundary';
import { SCENES } from './scenes/sceneRegistry';
import { STEP_SECONDS, usePanel } from './usePanel';
import { useShownSteps } from './useShownSteps';
import { useStepTarget } from './useStepTarget';
import { useWalkthrough } from './useWalkthrough';
import {
  closeWalkthrough,
  goToWalkthroughStep,
  setWalkthroughCollapsed,
  setWalkthroughSection,
  placeAmong,
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
      'Small label at the top of the walkthrough panel, above the name of the stage type it is about.',
  },
  collapse: {
    id: 'architect.stageEditor.walkthrough.collapse',
    defaultMessage: 'Hide the walkthrough for now',
    description:
      'Button that minimises the walkthrough panel to a progress ring in the stage editor toolbar, so the researcher can work on the page behind it. The ring opens it again at the same step.',
  },
});

const MARKDOWN_TAGS = [...ALLOWED_MARKDOWN_SECTION_TAGS, 'img', 'code'];

const SPRING = { type: 'spring', duration: 0.4, bounce: 0 } as const;
/** The old step's text fades out over the first half of a step change… */
const TEXT_OUT = { duration: STEP_SECONDS / 2, ease: 'easeIn' } as const;
/** …and the new step's over the second half. */
const TEXT_IN = {
  duration: STEP_SECONDS / 2,
  delay: STEP_SECONDS / 2,
  ease: 'easeOut',
} as const;
const NO_MOTION = { duration: 0 } as const;

/**
 * The room the panel keeps to: below the navigation bar (and any notice
 * above the editor) and above the editor's toolbar. A viewport too short to
 * leave a usable panel between the two (a small window, or a page zoomed to
 * 400%) gives the panel the whole viewport instead, over both bars.
 */
const ROOM =
  'top-[calc(100dvh-var(--architect-route-height,100dvh)+var(--architect-nav-height)+0.75rem)] bottom-24 [@media(max-height:30rem)]:top-3 [@media(max-height:30rem)]:bottom-3';

/** A guide to the stage being edited, in a panel floating over the editor. */
export default function StageWalkthrough() {
  const { identity } = useStageEdit();
  const walkthrough = useWalkthrough(identity?.type);
  const open = useWalkthroughState((state) => state.open);
  const collapsed = useWalkthroughState((state) => state.collapsed);

  useEffect(() => () => closeWalkthrough({ restoreFocus: false }), []);

  // Minimised, the walkthrough sits in the editor's toolbar instead.
  if (!open || collapsed || walkthrough === undefined) return null;
  if (walkthrough.steps.length === 0) return null;

  return (
    <WalkthroughPanel title={walkthrough.title} steps={walkthrough.steps} />
  );
}

function WalkthroughPanel({
  title,
  steps,
}: Readonly<{ title: string; steps: readonly WalkthroughStep[] }>) {
  const current = useWalkthroughState((state) => state.step);
  const shown = useShownSteps(steps);
  const index = placeAmong(current, shown);
  const place = shown[index];
  const step = place === undefined ? undefined : steps[place];
  const section = step?.section;

  useEffect(() => {
    setWalkthroughSection(section);
    return () => setWalkthroughSection(undefined);
  }, [section]);

  const target = useStepTarget(section, step?.field, step?.control);
  if (step === undefined) return null;

  const back = shown[index - 1];
  const next = shown[index + 1];
  return (
    <WalkthroughCard
      title={title}
      step={step}
      index={index}
      total={shown.length}
      target={target}
      onBack={back === undefined ? undefined : () => goToWalkthroughStep(back)}
      onNext={
        next === undefined
          ? () => closeWalkthrough()
          : () => goToWalkthroughStep(next)
      }
      isLast={next === undefined}
    />
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
 * The walkthrough as a card floating over the editor, beside the section its
 * step is about, or in the corner above the toolbar; as tall as its step,
 * with the footer pinned and long copy scrolling in the body. `usePanel`
 * places and sizes it.
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
  const focusRequest = useWalkthroughState((state) => state.focusRequest);
  const portalContainer = usePortalContainer();

  // On mount, and whenever the researcher asks for the panel again.
  const focusedFor = useRef<number | null>(null);
  useEffect(() => {
    if (focusedFor.current === focusRequest) return;
    focusedFor.current = focusRequest;
    if (takeWalkthroughFocus()) nextRef.current?.focus({ preventScroll: true });
  }, [focusRequest]);

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
    width,
    sized,
    ring,
    startDrag,
    settle,
    showStep,
  } = usePanel(target, reducedMotion);

  return (
    <>
      {/*
        Rendered in place rather than in the overlay layer, so it stacks with
        the editor: above the page, below the navigation bar and the toolbar.
      */}
      <motion.div
        aria-hidden
        className={cx(
          'ring-warning pointer-events-none fixed rounded ring-4',
          // A control in the toolbar is ringed over the toolbar.
          step.control === undefined ? 'z-10' : 'z-30',
        )}
        style={{
          top: ring.top,
          left: ring.left,
          width: ring.width,
          height: ring.height,
          opacity: ring.opacity,
        }}
      />
      {createPortal(
        <>
          <div
            ref={bounds}
            aria-hidden
            className={cx('fixed inset-x-3', ROOM)}
            style={{ pointerEvents: 'none' }}
          />
          <motion.div
            ref={card}
            drag
            dragListener={false}
            dragControls={dragControls}
            dragMomentum={false}
            onDragEnd={settle}
            style={{ x, y, width: sized ? width : undefined }}
            // oxlint-disable-next-line tailwindcss/enforce-logical -- placed from measured viewport coordinates, which start at the left
            className="pointer-events-auto fixed top-0 left-0 flex w-[min(30rem,calc(100vw-3rem))] flex-col"
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
              initial={
                reducedMotion ? false : { opacity: 0, y: 16, scale: 0.98 }
              }
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
                    <Eyebrow>
                      {intl.formatMessage(messages.walkthrough)}
                    </Eyebrow>
                    {/* Walkthrough content is English in every interface language. */}
                    <span
                      lang="en"
                      dir="ltr"
                      className="font-heading text-match-parent truncate text-sm font-bold"
                    >
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
                {/* The step's text, read out as it changes. */}
                <div ref={content} aria-live="polite" className="relative">
                  <AnimatePresence
                    mode="popLayout"
                    initial={false}
                    // A new step starts at its top, not where the last one was
                    // scrolled to.
                    onExitComplete={() =>
                      viewport.current?.scrollTo({ top: 0 })
                    }
                  >
                    <StepBody
                      key={index}
                      step={step}
                      headingId={headingId}
                      reducedMotion={reducedMotion}
                      target={target}
                      showStep={showStep}
                    />
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
                    onClick={() => {
                      // Back disables itself on the first step, and a disabled
                      // button drops focus to the page: hand it to Next first.
                      if (index === 1) nextRef.current?.focus();
                      onBack?.();
                    }}
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
                    onClick={onNext}
                  >
                    {intl.formatMessage(
                      isLast ? messages.finish : messages.next,
                    )}
                  </Button>
                </div>
              </footer>
            </MotionSurface>
          </motion.div>
        </>,
        portalContainer ?? document.body,
      )}
    </>
  );
}

/**
 * One step's scene and text. Leaving, it fades out over the new step and is
 * hidden from assistive technology and the keyboard. Arriving, and whenever
 * the element it points at appears or changes, it has the panel take it on
 * screen: everything a step change moves is planned from its height.
 */
function StepBody({
  step,
  headingId,
  reducedMotion,
  target,
  showStep,
}: Readonly<{
  step: WalkthroughStep;
  headingId: string;
  reducedMotion: boolean;
  target: HTMLElement | null;
  showStep: (target: HTMLElement | null) => void;
}>) {
  const isPresent = useIsPresent();
  useLayoutEffect(() => {
    if (isPresent) showStep(target);
  }, [isPresent, showStep, target]);

  const Scene = step.scene === undefined ? undefined : SCENES[step.scene];
  return (
    <motion.div
      aria-hidden={isPresent ? undefined : true}
      inert={!isPresent}
      className="flex flex-col gap-4"
      initial={reducedMotion ? false : { opacity: 0, x: 12 }}
      animate={{
        opacity: 1,
        x: 0,
        transition: reducedMotion ? NO_MOTION : TEXT_IN,
      }}
      exit={{
        opacity: 0,
        x: reducedMotion ? 0 : -12,
        transition: reducedMotion ? NO_MOTION : TEXT_OUT,
      }}
    >
      {Scene !== undefined && (
        <div className="w-full shrink-0">
          {/* Holds the scene's place while its code loads. */}
          <SceneBoundary>
            <Suspense fallback={<div className="aspect-720/412 w-full" />}>
              <Scene />
            </Suspense>
          </SceneBoundary>
        </div>
      )}
      <div className="flex flex-col gap-3">
        {/* Walkthrough content is English in every interface language. */}
        <Heading
          id={isPresent ? headingId : undefined}
          level="h4"
          margin="none"
          lang="en"
          dir="ltr"
        >
          {step.title}
        </Heading>
        {step.blocks.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </div>
    </motion.div>
  );
}

function Block({ block }: Readonly<{ block: WalkthroughBlock }>) {
  if (block.kind === 'practices') return <Practices items={block.items} />;
  return (
    <RenderMarkdown
      allowedElements={MARKDOWN_TAGS}
      render={<div lang="en" dir="ltr" />}
    >
      {block.text}
    </RenderMarkdown>
  );
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.stopPropagation();
  closeWalkthrough();
}
