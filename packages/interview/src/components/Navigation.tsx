'use client';

import { useDirection } from '@base-ui/react/direction-provider';
import { Drawer } from '@base-ui/react/drawer';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  LogOut,
  Settings,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  type ComponentProps,
  type ReactNode,
  type Ref,
  useCallback,
  useId,
  useRef,
  useState,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Button, IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';
import { usePortalContainer } from '@codaco/fresco-ui/PortalContainer';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { cva, cx } from '@codaco/fresco-ui/utils/cva';

import { navigationMessages as messages } from '../i18n/navigationMessages';
import type { UnavailableStage } from '../selectors/skip-logic';
import type { NavigationOrientation } from '../Shell';
import { useSyncFlush } from '../store/SyncFlushContext';
import PassphrasePrompter from './PassphrasePrompter';
import StagesMenu, { STAGES_MENU_LIST_ID } from './StagesMenu';

const describeExitError = () => <AppMessage message={messages.exitFailed} />;

const variants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
  },
  exit: {
    opacity: 0,
  },
};

type ContainerCustom = Readonly<{
  orientation: 'vertical' | 'horizontal';
  isRtl: boolean;
}>;

// A vertical rail slides in from the screen edge it sits against: the left in
// a left-to-right interview, the right in a right-to-left one.
const offscreen = ({ orientation, isRtl }: ContainerCustom) => ({
  x: orientation === 'vertical' ? (isRtl ? '100%' : '-100%') : 0,
  y: orientation === 'horizontal' ? '100%' : 0,
});

const containerVariants = {
  initial: (custom: ContainerCustom) => ({
    opacity: 0,
    ...offscreen(custom),
  }),
  animate: () => ({
    opacity: 1,
    y: 0,
    x: 0,
    transition: {
      when: 'beforeChildren',
      type: 'spring' as const,
      stiffness: 100,
      damping: 20,
    },
  }),
  exit: (custom: ContainerCustom) => ({
    opacity: 0,
    ...offscreen(custom),
    transition: { when: 'afterChildren' },
  }),
};

/**
 * The bar's controls share its length. When a small screen and an enlarged
 * text size leave too little of it, they give up length together, down to a
 * touch-target floor, rather than push one another out of the bar. The
 * progress bar only grows, so by then it has already given way.
 */
const barControlVariants = cva({
  base: 'shrink',
  variants: {
    orientation: {
      vertical: 'min-h-11',
      horizontal: 'min-w-11',
    },
  },
  defaultVariants: {
    orientation: 'vertical',
  },
});

// Icon buttons hold a fixed size, and the bar shrinks the wrapper around them.
// Button already caps its width at the wrapper's; this caps its height too.
const barIconButtonClassName = 'max-h-full';

const NavigationButton = ({
  disabled,
  className,
  wrapperClassName,
  buttonRef,
  ...props
}: ComponentProps<typeof IconButton> & {
  buttonRef?: Ref<HTMLButtonElement>;
  wrapperClassName?: string;
}) => {
  return (
    <motion.div variants={variants} className={wrapperClassName}>
      <IconButton
        ref={buttonRef}
        color="dynamic"
        variant="text"
        className={cx('[&>.lucide]:h-[2em]', barIconButtonClassName, className)}
        disabled={disabled}
        {...props}
        size="xl"
      />
    </motion.div>
  );
};

const navigationVariants = cva({
  base: 'flex max-h-none shrink-0 grow-0 items-center justify-between overflow-visible rounded-none shadow-none',
  variants: {
    orientation: {
      vertical: 'w-auto flex-col',
      horizontal: 'h-auto w-full flex-row',
    },
  },
  defaultVariants: {
    orientation: 'vertical',
  },
});

const progressContainerVariants = cva({
  base: 'm-6 flex grow',
  variants: {
    orientation: {
      vertical: '',
      horizontal: 'mx-4',
    },
  },
  defaultVariants: {
    orientation: 'vertical',
  },
});

/**
 * Participant-selectable text-size multipliers. 1 is the Shell's responsive
 * default; the bounds mirror classic Interviewer's Interface Scale setting.
 * The Shell snaps a host's `initialTextScale` to this list so the stepped
 * control always presents one of these values.
 */
export const TEXT_SCALE_OPTIONS = [0.9, 1, 1.1, 1.2, 1.3];
const MIN_TEXT_SCALE_PERCENT = Math.round(
  Math.min(...TEXT_SCALE_OPTIONS) * 100,
);
const MAX_TEXT_SCALE_PERCENT = Math.round(
  Math.max(...TEXT_SCALE_OPTIONS) * 100,
);
const TEXT_SCALE_PERCENT_STEP = 10;

const renderHiddenChunks = (chunks: ReactNode[]) => (
  <span className="sr-only">{chunks}</span>
);

type NavigationProps = {
  moveBackward: () => void;
  moveForward: () => void;
  disableMoveForward?: boolean;
  disableMoveBackward?: boolean;
  pulseNext: boolean;
  progress: number;
  orientation?: NavigationOrientation;
  forwardButtonRef?: Ref<HTMLButtonElement>;
  backButtonRef?: Ref<HTMLButtonElement>;
  onExit?: () => void;
  reviewMode?: boolean;
  allowStageNavigation?: boolean;
  allowUserScaling?: boolean;
  textScale?: number;
  onTextScaleChange?: (scale: number) => void;
  className?: string;
  goToStage?: (
    targetIndex: number,
    confirmUnavailable?: (availability: UnavailableStage) => Promise<boolean>,
  ) => Promise<void>;
};

const Navigation = ({
  moveBackward,
  moveForward,
  disableMoveForward,
  disableMoveBackward,
  pulseNext,
  progress,
  orientation = 'vertical',
  forwardButtonRef,
  backButtonRef,
  onExit,
  reviewMode,
  allowStageNavigation,
  allowUserScaling,
  textScale = 1,
  onTextScaleChange,
  className,
  goToStage,
}: NavigationProps) => {
  const intl = useAppIntl();
  // The Shell lays the navigation out in the interview's direction, so in a
  // right-to-left interview Back sits on the right and points right.
  const direction = useDirection();
  const isRtl = direction === 'rtl';
  const BackIcon =
    orientation === 'vertical' ? ChevronUp : isRtl ? ChevronRight : ChevronLeft;
  const ForwardIcon =
    orientation === 'vertical'
      ? ChevronDown
      : isRtl
        ? ChevronLeft
        : ChevronRight;

  const shouldReduceMotion = useReducedMotion();

  const stageNavigationEnabled = !!allowStageNavigation && !!goToStage;

  // The text-size control needs both the opt-in flag and a change handler —
  // one without the other would render a dead control.
  const userScalingEnabled = !!allowUserScaling && !!onTextScaleChange;

  // The settings popover hosts the exit action and the text-size control; with
  // neither available there is nothing to show, so the trigger is omitted.
  const showSettingsPopover = !!onExit || userScalingEnabled;

  const matchedTextScaleIndex = TEXT_SCALE_OPTIONS.findIndex(
    (scale) => scale === textScale,
  );
  // Shell-provided values are snapped to TEXT_SCALE_OPTIONS. Keep Navigation
  // robust when rendered directly by falling back to the default multiplier.
  const textScaleIndex =
    matchedTextScaleIndex === -1
      ? TEXT_SCALE_OPTIONS.findIndex((scale) => scale === 1)
      : matchedTextScaleIndex;
  const textScalePercent = Math.round(
    (TEXT_SCALE_OPTIONS[textScaleIndex] ?? 1) * 100,
  );
  const textSizeLabelId = useId();
  const textSizeControlRef = useRef<HTMLDivElement>(null);
  const [textScaleInputValue, setTextScaleInputValue] = useState(
    String(textScalePercent),
  );
  // The field mirrors the authoritative scale, so a change to it re-normalises
  // what is displayed. Compared during render rather than in an effect: an
  // effect would commit and paint the stale string for a frame first.
  const [displayedTextScalePercent, setDisplayedTextScalePercent] =
    useState(textScalePercent);
  if (displayedTextScalePercent !== textScalePercent) {
    setDisplayedTextScalePercent(textScalePercent);
    setTextScaleInputValue(String(textScalePercent));
  }
  const textScaleInputPercent = Number(textScaleInputValue);
  const hasTextScaleInputPercent =
    textScaleInputValue !== '' && Number.isFinite(textScaleInputPercent);

  const { confirm } = useDialog();
  const portalContainer = usePortalContainer();
  const flushPendingSync = useSyncFlush();

  // `menuOpen` drives the drawer panel; `menuSettled` drives the staggered
  // enter/exit of the cards inside it. On open we flip `menuSettled` only once
  // the panel has finished sliding in; on close we flip it first and let the
  // StagesMenu report back (`handleCardsClosed`) once the cards have animated
  // out, so the panel slides away only after — never over — the stagger.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSettled, setMenuSettled] = useState(false);
  const pendingStageRef = useRef<number | null>(null);

  const confirmUnavailable = useCallback(
    async (availability: UnavailableStage) =>
      (await confirm({
        title: <AppMessage message={messages.showTitle} />,
        description: (
          <AppMessage
            message={
              availability.kind === 'local-skip'
                ? messages.hiddenScreen
                : messages.outsidePath
            }
          />
        ),
        confirmLabel: <AppMessage message={messages.showScreen} />,
        cancelLabel: <AppMessage message={commonMessages.cancel} />,
        intent: 'warning',
        onConfirm: () => {},
      })) === true,
    [confirm],
  );

  const handleExit = useCallback(async () => {
    if (!onExit) return;
    await confirm({
      title: (
        <AppMessage
          message={
            reviewMode ? messages.exitReviewTitle : messages.exitInterviewTitle
          }
        />
      ),
      description: (
        <AppMessage
          message={
            reviewMode
              ? messages.exitReviewDescription
              : messages.exitInterviewDescription
          }
        />
      ),
      confirmLabel: (
        <AppMessage
          message={reviewMode ? messages.exitReview : messages.exitInterview}
        />
      ),
      cancelLabel: <AppMessage message={commonMessages.cancel} />,
      intent: 'warning',
      // Hand control back to the host only after pending session state is
      // written. The Shell's unmount-cleanup flush alone cannot enqueue the
      // final snapshot synchronously when a write is already on the wire (it
      // must await that write first), so a host that navigates on exit —
      // unmounting the Shell — could re-read the session between the
      // in-flight write and the final one. Exit is the one teardown the
      // Shell controls, so wait out the full flush here; it never rejects
      // and typically resolves in milliseconds. It runs while the
      // confirmation is still open, so nothing more can be asked of the
      // interview between the flush and the hand-over. When the host refuses
      // an answer or the interview language, the confirmation stays open
      // with an error, so the participant sees why and can try again; when
      // they cancel while it is saved, the interview stays open. Cancelling
      // is safe while the flush runs: the answers it saves belong to the
      // interview either way, and the hand-over is what it stops.
      abortable: true,
      describeError: describeExitError,
      onConfirm: async (signal) => {
        const stored = await flushPendingSync();
        if (signal.aborted) return;
        if (!stored) throw new Error('The interview could not be saved');
        onExit();
      },
    });
  }, [confirm, onExit, reviewMode, flushPendingSync]);

  const closeMenu = useCallback(
    (immediate: boolean) => {
      setMenuSettled(false);
      // Defer the panel slide to `handleCardsClosed` when cards are on screen;
      // otherwise (still opening, or a swipe already carried it off) close now.
      if (immediate || !menuSettled) {
        setMenuOpen(false);
      }
    },
    [menuSettled],
  );

  const handleCardsClosed = useCallback(() => setMenuOpen(false), []);

  const handleSelectStage = useCallback(
    (index: number) => {
      pendingStageRef.current = index;
      closeMenu(false);
    },
    [closeMenu],
  );

  return (
    <>
      <MotionSurface
        role="navigation"
        className={cx(navigationVariants({ orientation }), className)}
        spacing="xs"
        shadow="xs"
        noContainer
        variants={containerVariants}
        custom={{ orientation, isRtl } satisfies ContainerCustom}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {showSettingsPopover && (
          <motion.div
            variants={variants}
            className={cx(
              barControlVariants({ orientation }),
              orientation === 'horizontal' && 'order-1',
            )}
          >
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger
                render={
                  <IconButton
                    color="dynamic"
                    variant="text"
                    size="xl"
                    icon={<Settings />}
                    className={cx(
                      '[&>.lucide]:h-[1.5em]!',
                      barIconButtonClassName,
                    )}
                    aria-label={intl.formatMessage(messages.settings)}
                    data-testid="settings-button"
                  />
                }
              />
              <PopoverContent
                side={
                  orientation === 'vertical'
                    ? isRtl
                      ? 'left'
                      : 'right'
                    : 'top'
                }
                align="start"
                className="w-72 max-w-full"
                aria-label={intl.formatMessage(messages.interviewSettings)}
              >
                <div className="flex flex-col gap-2">
                  {userScalingEnabled && (
                    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
                      <legend
                        id={textSizeLabelId}
                        className="px-2 py-1.5 text-sm font-semibold"
                      >
                        <AppMessage
                          message={messages.textSize}
                          values={{ hidden: renderHiddenChunks }}
                        />
                      </legend>
                      <div ref={textSizeControlRef} className="w-full">
                        <InputField
                          aria-labelledby={textSizeLabelId}
                          type="number"
                          inputMode="numeric"
                          min={MIN_TEXT_SCALE_PERCENT}
                          max={MAX_TEXT_SCALE_PERCENT}
                          step={TEXT_SCALE_PERCENT_STEP}
                          value={textScaleInputValue}
                          onChange={(value) => {
                            const nextValue = value ?? '';
                            setTextScaleInputValue(nextValue);

                            const nextPercent = Number(nextValue);
                            const nextScale = nextPercent / 100;
                            if (
                              nextValue !== '' &&
                              TEXT_SCALE_OPTIONS.includes(nextScale)
                            ) {
                              onTextScaleChange?.(nextScale);
                            }
                          }}
                          onBlur={(event) => {
                            if (
                              event.relatedTarget instanceof HTMLElement &&
                              textSizeControlRef.current?.contains(
                                event.relatedTarget,
                              )
                            ) {
                              return;
                            }

                            setTextScaleInputValue(String(textScalePercent));
                          }}
                          stepperLabels={{
                            decrease: intl.formatMessage(
                              messages.decreaseTextSize,
                            ),
                            increase: intl.formatMessage(
                              messages.increaseTextSize,
                            ),
                          }}
                          stepperDisabled={{
                            decrease:
                              hasTextScaleInputPercent &&
                              textScaleInputPercent <= MIN_TEXT_SCALE_PERCENT,
                            increase:
                              hasTextScaleInputPercent &&
                              textScaleInputPercent >= MAX_TEXT_SCALE_PERCENT,
                          }}
                          // oxlint-disable-next-line formatjs/no-literal-string-in-jsx -- Unit symbol; the live output formats the complete percentage for the active locale.
                          suffixComponent={<span aria-hidden="true">%</span>}
                          className="w-full! [&_input]:text-end"
                        />
                        <output
                          aria-live="polite"
                          aria-atomic="true"
                          className="sr-only"
                        >
                          <AppMessage
                            message={messages.currentTextSize}
                            values={{ size: textScalePercent / 100 }}
                          />
                        </output>
                      </div>
                    </fieldset>
                  )}
                  {userScalingEnabled && onExit && (
                    <hr className="mx-auto my-1 h-px w-full rounded border-0 bg-current/20" />
                  )}
                  {onExit && (
                    <Button
                      color="dynamic"
                      variant="text"
                      size="md"
                      icon={<LogOut aria-hidden />}
                      onClick={() => {
                        setSettingsOpen(false);
                        void handleExit();
                      }}
                      className="w-full justify-start rounded-sm px-4"
                      data-testid="exit-button"
                    >
                      <AppMessage
                        message={
                          reviewMode
                            ? messages.exitReview
                            : messages.exitInterview
                        }
                      />
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </motion.div>
        )}
        <NavigationButton
          wrapperClassName={cx(
            barControlVariants({ orientation }),
            orientation === 'horizontal' && 'order-3',
          )}
          onClick={moveBackward}
          disabled={disableMoveBackward}
          icon={<BackIcon />}
          aria-label={intl.formatMessage(messages.previousStep)}
          buttonRef={backButtonRef}
          data-testid="previous-button"
        />
        <PassphrasePrompter
          orientation={orientation}
          // Horizontally it joins the settings button at the leading edge,
          // clear of the back and forward buttons. Sharing settings' `order-1`
          // keeps it straight after settings, as it is in the DOM.
          className={cx(
            barControlVariants({ orientation }),
            orientation === 'horizontal' && 'order-1',
          )}
        />
        {stageNavigationEnabled ? (
          <motion.button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-label={intl.formatMessage(messages.goToScreen)}
            onClick={() => setMenuOpen(true)}
            variants={variants}
            className={cx(
              progressContainerVariants({ orientation }),
              orientation === 'horizontal' && 'order-2',
              // Wrap the bar directly so the focus ring hugs its pill shape
              // rather than a rectangular wrapper.
              'focusable cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0',
            )}
          >
            <ProgressBar percentProgress={progress} orientation={orientation} />
          </motion.button>
        ) : (
          <motion.div
            className={cx(
              progressContainerVariants({ orientation }),
              orientation === 'horizontal' && 'order-2',
            )}
            variants={variants}
          >
            <ProgressBar percentProgress={progress} orientation={orientation} />
          </motion.div>
        )}
        <NavigationButton
          className={cx(
            pulseNext &&
              'bg-success ui-enabled:hover:bg-success outline-success',
            pulseNext && !shouldReduceMotion && 'animate-pulse-glow',
          )}
          wrapperClassName={cx(
            barControlVariants({ orientation }),
            orientation === 'horizontal' && 'order-4',
          )}
          onClick={moveForward}
          disabled={disableMoveForward}
          icon={<ForwardIcon className="size-8" strokeWidth="3px" />}
          aria-label={intl.formatMessage(messages.nextStep)}
          buttonRef={forwardButtonRef}
          data-testid="next-button"
        />
      </MotionSurface>
      {stageNavigationEnabled && (
        <Drawer.Root
          open={menuOpen}
          onOpenChange={(next, details) => {
            if (next) {
              setMenuOpen(true);
              return;
            }
            // A swipe has already carried the panel off, so close immediately;
            // dismissals via the backdrop/Escape defer to the card exit.
            closeMenu(details.reason === 'swipe');
          }}
          onOpenChangeComplete={(next) => {
            if (next) {
              setMenuSettled(true);
              return;
            }
            const target = pendingStageRef.current;
            pendingStageRef.current = null;
            if (target !== null) {
              void goToStage?.(target, confirmUnavailable);
            }
          }}
          swipeDirection={
            orientation === 'vertical' ? (isRtl ? 'right' : 'left') : 'down'
          }
        >
          <Drawer.Portal container={portalContainer ?? undefined}>
            <Drawer.Backdrop className="bg-overlay publish-colors fixed inset-0 backdrop-blur-xs transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
            <Drawer.Viewport
              className={cx(
                'fixed',
                orientation === 'vertical'
                  ? 'inset-y-0 inset-s-0'
                  : 'inset-x-0 bottom-0',
              )}
            >
              <Drawer.Popup
                aria-label={intl.formatMessage(messages.goToScreen)}
                initialFocus={() =>
                  document.getElementById(STAGES_MENU_LIST_ID)
                }
                className={cx(
                  'bg-surface elevation-medium flex flex-col overflow-hidden transition-transform duration-300 ease-out',
                  'data-swiping:duration-0 motion-reduce:transition-none',
                  orientation === 'vertical'
                    ? 'h-full w-[min(34rem,92vw)] transform-[translateX(var(--drawer-swipe-movement-x,0px))] data-ending-style:transform-[translateX(-100%)] data-starting-style:transform-[translateX(-100%)] rtl:data-ending-style:transform-[translateX(100%)] rtl:data-starting-style:transform-[translateX(100%)]'
                    : 'max-h-[85vh] w-full transform-[translateY(var(--drawer-swipe-movement-y,0px))] data-ending-style:transform-[translateY(100%)] data-starting-style:transform-[translateY(100%)]',
                )}
              >
                <StagesMenu
                  onSelect={handleSelectStage}
                  orientation={orientation}
                  open={menuSettled}
                  onClosed={handleCardsClosed}
                />
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.Root>
      )}
    </>
  );
};

export default Navigation;
