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
  type Ref,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

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

import type { UnavailableStage } from '../selectors/skip-logic';
import type { NavigationOrientation } from '../Shell';
import { useSyncFlush } from '../store/SyncFlushContext';
import PassphrasePrompter from './PassphrasePrompter';
import StagesMenu, { STAGES_MENU_LIST_ID } from './StagesMenu';

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

const containerVariants = {
  initial: (orientation: 'vertical' | 'horizontal') => ({
    opacity: 0,
    x: orientation === 'vertical' ? '-100%' : 0,
    y: orientation === 'horizontal' ? '100%' : 0,
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
  exit: (orientation: 'vertical' | 'horizontal') => ({
    opacity: 0,
    x: orientation === 'vertical' ? '-100%' : 0,
    y: orientation === 'horizontal' ? '100%' : 0,
    transition: { when: 'afterChildren' },
  }),
};

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
        className={cx('[&>.lucide]:h-[2em]', className)}
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
  const BackIcon = orientation === 'vertical' ? ChevronUp : ChevronLeft;
  const ForwardIcon = orientation === 'vertical' ? ChevronDown : ChevronRight;

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
  const textScaleInputPercent = Number(textScaleInputValue);
  const hasTextScaleInputPercent =
    textScaleInputValue !== '' && Number.isFinite(textScaleInputPercent);

  useEffect(() => {
    setTextScaleInputValue(String(textScalePercent));
  }, [textScalePercent]);

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
        title: 'Show this screen?',
        description:
          availability.kind === 'local-skip'
            ? 'This screen is hidden based on the answers given so far. Do you want to show it anyway?'
            : 'This screen is outside the current interview path based on the answers given so far. Do you want to show it anyway?',
        confirmLabel: 'Show screen',
        cancelLabel: 'Cancel',
        intent: 'warning',
        onConfirm: () => {},
      })) === true,
    [confirm],
  );

  const handleExit = useCallback(async () => {
    if (!onExit) return;
    const confirmed = await confirm({
      title: reviewMode ? 'Exit this review?' : 'Exit this interview?',
      description: reviewMode
        ? 'Changes made during this review will not be saved.'
        : 'Your answers so far will be saved and you can continue later.',
      confirmLabel: reviewMode ? 'Exit review' : 'Exit interview',
      cancelLabel: 'Cancel',
      intent: 'warning',
      onConfirm: () => {},
    });
    if (confirmed === true) {
      // Hand control back to the host only after pending session state is
      // written. The Shell's unmount-cleanup flush alone cannot enqueue the
      // final snapshot synchronously when a write is already on the wire (it
      // must await that write first), so a host that navigates on exit —
      // unmounting the Shell — could re-read the session between the
      // in-flight write and the final one. Exit is the one teardown the
      // Shell controls, so wait out the full flush here; it never rejects
      // and typically resolves in milliseconds.
      await flushPendingSync();
      onExit();
    }
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
        custom={orientation}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {showSettingsPopover && (
          <motion.div
            variants={variants}
            className={orientation === 'horizontal' ? 'order-1' : undefined}
          >
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger
                render={
                  <IconButton
                    color="dynamic"
                    variant="text"
                    size="xl"
                    icon={<Settings />}
                    className="[&>.lucide]:h-[1.5em]!"
                    aria-label="Settings"
                    data-testid="settings-button"
                  />
                }
              />
              <PopoverContent
                side={orientation === 'vertical' ? 'right' : 'top'}
                align="start"
                className="w-72 max-w-full"
                aria-label="Interview settings"
              >
                <div className="flex flex-col gap-2">
                  {userScalingEnabled && (
                    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
                      <legend
                        id={textSizeLabelId}
                        className="px-2 py-1.5 text-sm font-semibold"
                      >
                        Text size
                        <span className="sr-only"> percentage</span>
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
                            decrease: 'Decrease text size',
                            increase: 'Increase text size',
                          }}
                          stepperDisabled={{
                            decrease:
                              hasTextScaleInputPercent &&
                              textScaleInputPercent <= MIN_TEXT_SCALE_PERCENT,
                            increase:
                              hasTextScaleInputPercent &&
                              textScaleInputPercent >= MAX_TEXT_SCALE_PERCENT,
                          }}
                          suffixComponent={<span aria-hidden="true">%</span>}
                          className="w-full! [&_input]:text-right"
                        />
                        <output
                          aria-live="polite"
                          aria-atomic="true"
                          className="sr-only"
                        >
                          Current text size: {textScalePercent}%
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
                      {reviewMode ? 'Exit review' : 'Exit interview'}
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </motion.div>
        )}
        <NavigationButton
          wrapperClassName={
            orientation === 'horizontal' ? 'order-3' : undefined
          }
          onClick={moveBackward}
          disabled={disableMoveBackward}
          icon={<BackIcon />}
          aria-label="Previous Step"
          buttonRef={backButtonRef}
          data-testid="previous-button"
        />
        {orientation === 'vertical' && <PassphrasePrompter />}
        {stageNavigationEnabled ? (
          <motion.button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-label="Go to another screen"
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
          wrapperClassName={
            orientation === 'horizontal' ? 'order-4' : undefined
          }
          onClick={moveForward}
          disabled={disableMoveForward}
          icon={<ForwardIcon className="size-8" strokeWidth="3px" />}
          aria-label="Next Step"
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
          swipeDirection={orientation === 'vertical' ? 'left' : 'down'}
        >
          <Drawer.Portal container={portalContainer ?? undefined}>
            <Drawer.Backdrop className="bg-overlay publish-colors fixed inset-0 backdrop-blur-xs transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
            <Drawer.Viewport
              className={cx(
                'fixed',
                orientation === 'vertical'
                  ? 'inset-y-0 left-0'
                  : 'inset-x-0 bottom-0',
              )}
            >
              <Drawer.Popup
                aria-label="Go to another screen"
                initialFocus={() =>
                  document.getElementById(STAGES_MENU_LIST_ID)
                }
                className={cx(
                  'bg-surface elevation-medium flex flex-col overflow-hidden transition-transform duration-300 ease-out',
                  'data-swiping:duration-0 motion-reduce:transition-none',
                  orientation === 'vertical'
                    ? 'h-full w-[min(34rem,92vw)] transform-[translateX(var(--drawer-swipe-movement-x,0px))] data-ending-style:transform-[translateX(-100%)] data-starting-style:transform-[translateX(-100%)]'
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
