import {
  GripHorizontal,
  Maximize2,
  Minimize2,
  Minus,
  MousePointerClick,
} from 'lucide-react';
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
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
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
import { subscribeToPage, useOpenModals, type OpenModal } from './useOpenModal';
import {
  closeWalkthrough,
  getWalkthroughPosition,
  goToDetourStep,
  goToWalkthroughStep,
  setWalkthroughCollapsed,
  setWalkthroughExpanded,
  setWalkthroughPosition,
  setWalkthroughSection,
  takeWalkthroughFocus,
  useWalkthroughState,
} from './walkthroughStore';

const messages = defineMessages({
  progress: {
    id: 'architect.stageEditor.walkthrough.progress',
    defaultMessage: 'Step {index, number} of {total, number}',
    description: 'Position in the stage walkthrough. index is one-based.',
  },
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
      'Small label above the name of the stage type at the top of the walkthrough, and on the minimised walkthrough.',
  },
  progressShort: {
    id: 'architect.stageEditor.walkthrough.progressShort',
    defaultMessage: '{index, number}/{total, number}',
    description:
      'Compact step count inside the progress ring of the minimised walkthrough, e.g. "1/8". index is one-based.',
  },
  resume: {
    id: 'architect.stageEditor.walkthrough.resume',
    defaultMessage: 'Resume',
    description:
      'Button on the minimised walkthrough that opens it again at the step the researcher was on.',
  },
  move: {
    id: 'architect.stageEditor.walkthrough.move',
    defaultMessage: 'Move the walkthrough',
    description:
      'Grip on the walkthrough panel, used to move the panel out of the way.',
  },
  moveHint: {
    id: 'architect.stageEditor.walkthrough.moveHint',
    defaultMessage:
      'Drag to move it, use the arrow keys, or activate to move it to the other side of the screen.',
    description:
      'Screen-reader description of the grip on the walkthrough panel, saying the ways it can be moved.',
  },
  expand: {
    id: 'architect.stageEditor.walkthrough.expand',
    defaultMessage: 'Make the walkthrough larger',
    description:
      'Tooltip and accessible name of the button in the walkthrough panel header that widens the panel, so its text and animations are easier to read.',
  },
  shrink: {
    id: 'architect.stageEditor.walkthrough.shrink',
    defaultMessage: 'Make the walkthrough smaller',
    description:
      'Tooltip and accessible name of the button in the widened walkthrough panel header that returns it to its usual size.',
  },
  collapse: {
    id: 'architect.stageEditor.walkthrough.collapse',
    defaultMessage: 'Hide the walkthrough for now',
    description:
      'Button that folds the walkthrough panel down to a small bar, so the researcher can work on the page behind it.',
  },
  inThisDialog: {
    id: 'architect.stageEditor.walkthrough.inThisDialog',
    defaultMessage: 'In this window',
    description:
      'Eyebrow on walkthrough steps about the dialog the researcher has open, rather than the stage editor behind it.',
  },
  saveToContinue: {
    id: 'architect.stageEditor.walkthrough.saveToContinue',
    defaultMessage:
      'Click <strong>{label}</strong> to save this, and the walkthrough will carry on.',
    description:
      'Shown on the last walkthrough step about an open dialog, in place of a Next button. label is the text of the dialog’s own save button, such as “Add” or “Save”. The walkthrough resumes by itself once the dialog closes.',
  },
  saveToContinueUnlabelled: {
    id: 'architect.stageEditor.walkthrough.saveToContinueUnlabelled',
    defaultMessage: 'Save this window, and the walkthrough will carry on.',
    description:
      'Shown on the last walkthrough step about an open dialog whose save button has no text. The walkthrough resumes by itself once the dialog closes.',
  },
  chooseToContinue: {
    id: 'architect.stageEditor.walkthrough.chooseToContinue',
    defaultMessage:
      'Make your choice here and this window closes by itself; the walkthrough will carry on.',
    description:
      'Shown on the last walkthrough step about an open dialog that has no save button, such as a picker that closes once something is chosen. The walkthrough resumes by itself once the dialog closes.',
  },
});

const renderStrong = (chunks: ReactNode[]) => <strong>{chunks}</strong>;

const MARKDOWN_TAGS = [...ALLOWED_MARKDOWN_SECTION_TAGS, 'img', 'code'];

const SPRING = { type: 'spring', duration: 0.4, bounce: 0 } as const;

export function useStageWalkthrough(): Walkthrough | undefined {
  const { identity } = useStageEdit();
  return identity === undefined ? undefined : walkthroughFor(identity.type);
}

const normalise = (text: string) =>
  text.replace(/\*$/, '').trim().toLowerCase();

/**
 * Whether a step is written for this dialog. A step names one or more
 * alternatives separated by "|"; each matches a title containing it, or,
 * written as "=text", a title that is exactly that.
 */
const matchesModal = (step: WalkthroughStep, modal: OpenModal) => {
  if (step.dialog === undefined) return false;
  const title = normalise(modal.title);
  return step.dialog.split('|').some((alternative) => {
    const wanted = alternative.trim();
    return wanted.startsWith('=')
      ? title === normalise(wanted.slice(1))
      : title.includes(normalise(wanted));
  });
};

/**
 * A guide to the stage being edited, in a panel floating over the editor.
 *
 * It follows the researcher into the dialogs the editor opens: a modal makes
 * the rest of the page inert, so while one is open the panel renders inside
 * the topmost modal's layer, and any steps written for an open dialog take
 * over until it closes.
 */
export default function StageWalkthrough({
  sections,
}: Readonly<{ sections: StageSectionsStore }>) {
  const walkthrough = useStageWalkthrough();
  const { open } = useWalkthroughState();
  const modals = useOpenModals();
  const portalContainer = usePortalContainer();

  useEffect(() => () => closeWalkthrough({ restoreFocus: false }), []);

  if (!open || walkthrough === undefined) return null;

  const top = modals.at(-1);
  const host = modals.findLast((modal) =>
    walkthrough.steps.some((step) => matchesModal(step, modal)),
  );

  // Portalling into a different layer remounts the panel, which is what lets
  // it take focus only when asked and keep its place across dialogs.
  return createPortal(
    <WalkthroughPanel
      title={walkthrough.title}
      sections={sections}
      allSteps={walkthrough.steps}
      host={host}
      covered={top !== undefined && top !== host}
    />,
    top?.layer ?? portalContainer ?? document.body,
  );
}

function WalkthroughPanel({
  title,
  sections,
  allSteps,
  host,
  covered,
}: Readonly<{
  title: string;
  sections: StageSectionsStore;
  allSteps: readonly WalkthroughStep[];
  /** The open dialog the current steps are about, if any. */
  host: OpenModal | undefined;
  /** Whether a dialog the steps say nothing about sits over what they do. */
  covered: boolean;
}>) {
  const intl = useAppIntl();
  const { step: mainIndex, collapsed, detours } = useWalkthroughState();

  const entries = useSyncExternalStore(
    sections.subscribe,
    sections.getSnapshot,
    sections.getServerSnapshot,
  );

  const steps = allSteps.filter((step) =>
    host === undefined ? step.dialog === undefined : matchesModal(step, host),
  );
  const index = Math.min(
    host === undefined ? mainIndex : (detours[host.serial] ?? 0),
    steps.length - 1,
  );
  const step = steps[index];

  const sectionId =
    host !== undefined || step?.section === undefined
      ? undefined
      : entries.find(
          (entry) => entry.title.toLowerCase() === step.section?.toLowerCase(),
        )?.id;
  useEffect(() => {
    setWalkthroughSection(collapsed ? undefined : sectionId);
    return () => setWalkthroughSection(undefined);
  }, [collapsed, sectionId]);

  const target = useStepTarget(host?.popup ?? null, sectionId, step?.field);
  const isLast = index === steps.length - 1;
  const awaitingSave = host !== undefined && isLast;
  const saveButton = useSaveButton(
    awaitingSave && !covered ? host.popup : null,
  );

  if (step === undefined) return null;

  if (collapsed) {
    // Minimised over the editor, it sits in the editor's toolbar instead;
    // a dialog makes that toolbar inert, so inside one it stays a pill.
    if (host === undefined) return null;
    return (
      <MinimizedPill index={index} total={steps.length} title={step.title} />
    );
  }

  const goTo = (next: number) =>
    host === undefined
      ? goToWalkthroughStep(next)
      : goToDetourStep(host.serial, next);

  return (
    <WalkthroughCard
      eyebrow={intl.formatMessage(
        host === undefined ? messages.walkthrough : messages.inThisDialog,
      )}
      title={host?.title ?? title}
      step={step}
      index={index}
      total={steps.length}
      // A ring over something a dialog covers would point at what cannot be used.
      target={covered ? null : target}
      saveButton={saveButton}
      awaitingSave={awaitingSave}
      onBack={index === 0 ? undefined : () => goTo(index - 1)}
      onNext={
        isLast
          ? () => closeWalkthrough({ finished: true })
          : () => goTo(index + 1)
      }
      isLast={isLast}
    />
  );
}

/** The walkthrough minimised to a pill in the corner, to pick up again. */
function MinimizedPill({
  index,
  total,
  title,
}: Readonly<{ index: number; total: number; title: string }>) {
  const intl = useAppIntl();
  const ref = useRef<HTMLButtonElement>(null);
  const reducedMotion = usePrefersReducedMotion() === true;

  useEffect(() => {
    if (takeWalkthroughFocus()) ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <MotionSurface
      as="section"
      aria-label={intl.formatMessage(messages.walkthrough)}
      floating
      shadow="lg"
      spacing="none"
      noContainer
      className="pointer-events-auto fixed inset-e-6 bottom-24 flex items-center gap-3 rounded-full py-2 ps-2 pe-3"
      initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING}
    >
      <ProgressRing index={index} total={total} />
      <span className="flex max-w-[min(14rem,calc(100vw-16rem))] min-w-0 flex-col">
        <Eyebrow render={<span />}>
          {intl.formatMessage(messages.walkthrough)}
        </Eyebrow>
        <span className="font-heading truncate text-sm font-bold">{title}</span>
      </span>
      <Button
        ref={ref}
        color="primary"
        size="sm"
        onClick={() => setWalkthroughCollapsed(false)}
      >
        {intl.formatMessage(messages.resume)}
      </Button>
      <CloseButton size="sm" onClick={() => closeWalkthrough()} />
    </MotionSurface>
  );
}

const RING_RADIUS = 16;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export function ProgressRing({
  index,
  total,
}: Readonly<{ index: number; total: number }>) {
  const intl = useAppIntl();
  const done = (index + 1) / total;
  return (
    <span className="relative grid size-10 shrink-0 place-items-center">
      <svg
        aria-hidden
        viewBox="0 0 40 40"
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={20}
          cy={20}
          r={RING_RADIUS}
          fill="none"
          className="stroke-current/12"
          strokeWidth={3.5}
        />
        <circle
          cx={20}
          cy={20}
          r={RING_RADIUS}
          fill="none"
          className="stroke-primary"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - done)}
        />
      </svg>
      <span className="sr-only">
        {intl.formatMessage(messages.progress, { index: index + 1, total })}
      </span>
      <span aria-hidden className="font-heading text-2xs font-extrabold">
        {intl.formatMessage(messages.progressShort, {
          index: index + 1,
          total,
        })}
      </span>
    </span>
  );
}

/**
 * One segment per step, filled up to the step the researcher is on. Hidden
 * from assistive technology: the footer states the same position in words.
 */
function StepSegments({
  index,
  total,
}: Readonly<{ index: number; total: number }>) {
  return (
    <div aria-hidden className="flex gap-1">
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
  eyebrow,
  title,
  step,
  index,
  total,
  target,
  saveButton,
  awaitingSave,
  onBack,
  onNext,
  isLast,
}: Readonly<{
  eyebrow: string;
  title: string;
  step: WalkthroughStep;
  index: number;
  total: number;
  target: HTMLElement | null;
  /** The open dialog's save button, ringed on the last step about it. */
  saveButton: HTMLButtonElement | null;
  /**
   * The last step about an open dialog: it ends when the dialog is saved and
   * closes, so it asks for that instead of offering Next.
   */
  awaitingSave: boolean;
  onBack: (() => void) | undefined;
  onNext: () => void;
  isLast: boolean;
}>) {
  const intl = useAppIntl();
  const headingId = useId();
  const moveHintId = useId();
  const nextRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = usePrefersReducedMotion() === true;
  const { expanded, focusRequest } = useWalkthroughState();

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
    remember,
    startDrag,
    flipSide,
    nudge,
  } = useMovablePanel(clearOfNav, reducedMotion);
  const Scene = step.scene === undefined ? undefined : SCENES[step.scene];
  const saveLabel = saveButton?.textContent?.trim() ?? '';

  return (
    <>
      {target !== null && (
        <Spotlight target={target} reducedMotion={reducedMotion} />
      )}
      {saveButton !== null && saveButton !== target && (
        <Spotlight target={saveButton} reducedMotion={reducedMotion} />
      )}
      <div
        ref={bounds}
        aria-hidden
        className="fixed inset-3"
        style={{ pointerEvents: 'none', top: clearOfNav + 12 }}
      />
      <motion.div
        ref={card}
        drag
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={bounds}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={remember}
        style={{ x, y, maxHeight }}
        className={cx(
          'pointer-events-auto fixed inset-e-6 bottom-24 flex flex-col',
          expanded
            ? 'w-[min(44rem,calc(100vw-3rem))]'
            : 'w-[min(24rem,calc(100vw-3rem))]',
        )}
      >
        <MotionSurface
          as="section"
          aria-labelledby={headingId}
          floating
          shadow="lg"
          spacing="none"
          noContainer
          onKeyDown={closeOnEscape}
          className="flex min-h-0 w-full flex-col overflow-hidden"
          initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={SPRING}
        >
          <header
            onPointerDown={startDrag}
            className="flex shrink-0 cursor-grab touch-none flex-col gap-3 px-5 pt-4 select-none active:cursor-grabbing"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <Eyebrow>{eyebrow}</Eyebrow>
                <span className="font-heading truncate text-sm font-bold">
                  {title}
                </span>
              </div>
              <div className="-me-2 flex shrink-0 items-center">
                <IconButton
                  data-grip
                  size="sm"
                  variant="text"
                  color="dynamic"
                  icon={<GripHorizontal />}
                  title={intl.formatMessage(messages.move)}
                  aria-label={intl.formatMessage(messages.move)}
                  aria-describedby={moveHintId}
                  onClick={flipSide}
                  onKeyDown={nudge}
                  className="cursor-grab active:cursor-grabbing"
                />
                <span id={moveHintId} className="sr-only">
                  {intl.formatMessage(messages.moveHint)}
                </span>
                <IconButton
                  size="sm"
                  variant="text"
                  color="dynamic"
                  icon={expanded ? <Minimize2 /> : <Maximize2 />}
                  title={intl.formatMessage(
                    expanded ? messages.shrink : messages.expand,
                  )}
                  aria-label={intl.formatMessage(
                    expanded ? messages.shrink : messages.expand,
                  )}
                  onClick={() => setWalkthroughExpanded(!expanded)}
                />
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
            <StepSegments index={index} total={total} />
          </header>
          <ScrollArea
            ref={body}
            viewportClassName="flex flex-col gap-4 px-5 pt-6 pb-4"
          >
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
            {awaitingSave && (
              <Alert
                variant="info"
                density="compact"
                icon={MousePointerClick}
                className="my-0 shrink-0"
              >
                {saveButton === null
                  ? intl.formatMessage(messages.chooseToContinue)
                  : saveLabel === ''
                    ? intl.formatMessage(messages.saveToContinueUnlabelled)
                    : intl.formatMessage(messages.saveToContinue, {
                        label: saveLabel,
                        strong: renderStrong,
                      })}
              </Alert>
            )}
          </ScrollArea>
          <footer className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-5 py-3">
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
            <span className="text-sm opacity-70">
              {intl.formatMessage(messages.progress, {
                index: index + 1,
                total,
              })}
            </span>
            <div className="flex justify-end">
              {!awaitingSave && (
                <Button
                  ref={nextRef}
                  color="primary"
                  size="sm"
                  onClick={toTop(onNext)}
                >
                  {intl.formatMessage(isLast ? messages.finish : messages.next)}
                </Button>
              )}
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

/** The submit button of a dialog's form, which saves and closes it. */
function useSaveButton(popup: HTMLElement | null): HTMLButtonElement | null {
  // The dialog's own save sits in its footer, outside the form it submits,
  // and names that form; a submit inside the body (a preview's "Check
  // response") belongs to something else.
  const getSnapshot = useCallback(() => {
    if (popup === null) return null;
    const submits = [
      ...popup.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
    ];
    return (
      submits.find((button) => button.hasAttribute('form')) ??
      submits.at(-1) ??
      null
    );
  }, [popup]);
  return useSyncExternalStore(subscribeToPage, getSnapshot, () => null);
}

/** How far one arrow key press moves the panel. */
const NUDGE = 32;
/** How far the pointer may travel on the grip and still count as a click. */
const CLICK_SLOP = 5;

/**
 * Lets the researcher move the panel out of the way: by dragging its header,
 * with the arrow keys on its grip, or by clicking the grip to send it to the
 * other side of the window. It stays inside `bounds`, and keeps where it was
 * put when it remounts to follow a dialog.
 */
function useMovablePanel(clearOfNav: number, reducedMotion: boolean) {
  const card = useRef<HTMLDivElement>(null);
  const bounds = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const pressedAt = useRef({ x: 0, y: 0 });
  const start = getWalkthroughPosition();
  const x = useMotionValue(start.x);
  const y = useMotionValue(start.y);
  const nav = useMotionValue(clearOfNav);
  useEffect(() => nav.set(clearOfNav), [clearOfNav, nav]);
  // As tall as the step needs, up to the room between the navigation bar and
  // the panel's home in the corner. Moving the panel never changes its size.
  const maxHeight = useTransform(
    nav,
    (top) => `calc(100dvh - ${top}px - 7rem)`,
  );

  const remember = useCallback(() => {
    setWalkthroughPosition({ x: x.get(), y: y.get() });
  }, [x, y]);

  const moveBy = useCallback(
    (dx: number, dy: number, { animated = false } = {}) => {
      const rect = card.current?.getBoundingClientRect();
      const room = bounds.current?.getBoundingClientRect();
      if (rect === undefined || room === undefined) return;
      // The top edge wins when the panel cannot fit, so it never goes under
      // the navigation bar.
      const toX =
        x.get() +
        Math.max(Math.min(dx, room.right - rect.right), room.left - rect.left);
      const toY =
        y.get() +
        Math.max(Math.min(dy, room.bottom - rect.bottom), room.top - rect.top);
      if (animated && !reducedMotion) {
        void animate(x, toX, SPRING);
        void animate(y, toY, SPRING);
      } else {
        x.set(toX);
        y.set(toY);
      }
      setWalkthroughPosition({ x: toX, y: toY });
    },
    [reducedMotion, x, y],
  );

  // A taller step must not push the panel's top under the navigation bar: the
  // panel moves down to fit instead.
  useEffect(() => {
    const element = card.current;
    if (element === null) return undefined;
    const observer = new ResizeObserver(() => moveBy(0, 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, [moveBy]);

  const startDrag = useCallback(
    (event: ReactPointerEvent) => {
      const from = event.target instanceof Element ? event.target : null;
      if (from?.closest('button:not([data-grip]), a') != null) return;
      pressedAt.current = { x: event.clientX, y: event.clientY };
      // Otherwise moving the pointer across the page selects its text.
      event.preventDefault();
      dragControls.start(event);
    },
    [dragControls],
  );

  const flipSide = useCallback(
    (event: ReactMouseEvent) => {
      // A pointer that travelled was dragging, not asking to change sides.
      const travelled = Math.hypot(
        event.clientX - pressedAt.current.x,
        event.clientY - pressedAt.current.y,
      );
      if (event.detail !== 0 && travelled > CLICK_SLOP) return;
      const rect = card.current?.getBoundingClientRect();
      const room = bounds.current?.getBoundingClientRect();
      if (rect === undefined || room === undefined) return;
      const onRight = rect.left + rect.width / 2 > window.innerWidth / 2;
      moveBy(onRight ? room.left - rect.left : room.right - rect.right, 0, {
        animated: true,
      });
    },
    [moveBy],
  );

  const nudge = useCallback(
    (event: KeyboardEvent) => {
      const step = {
        ArrowLeft: [-NUDGE, 0],
        ArrowRight: [NUDGE, 0],
        ArrowUp: [0, -NUDGE],
        ArrowDown: [0, NUDGE],
      }[event.key];
      if (step === undefined) return;
      event.preventDefault();
      moveBy(step[0] ?? 0, step[1] ?? 0);
    },
    [moveBy],
  );

  return {
    card,
    bounds,
    dragControls,
    x,
    y,
    maxHeight,
    remember,
    startDrag,
    flipSide,
    nudge,
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
 * The element a step points at. On the page, a section (or a field inside
 * it); inside a dialog, a field of that dialog.
 */
function useStepTarget(
  scope: HTMLElement | null,
  sectionId: string | undefined,
  field: string | undefined,
): HTMLElement | null {
  const getSnapshot = useCallback(() => {
    const fieldSelector =
      field === undefined
        ? undefined
        : `[data-field-name="${CSS.escape(field)}"]`;
    if (scope !== null) {
      return fieldSelector === undefined
        ? null
        : scope.querySelector<HTMLElement>(fieldSelector);
    }
    if (sectionId === undefined) return null;
    const section = document.getElementById(sectionId);
    if (section === null || fieldSelector === undefined) return section;
    return section.querySelector<HTMLElement>(fieldSelector) ?? section;
  }, [field, scope, sectionId]);

  return useSyncExternalStore(subscribeToPage, getSnapshot, () => null);
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
