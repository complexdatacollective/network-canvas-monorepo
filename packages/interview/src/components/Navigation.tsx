'use client';

import { useDirection } from '@base-ui/react/direction-provider';
import { Drawer } from '@base-ui/react/drawer';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Languages,
  LogOut,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  type ComponentProps,
  type Ref,
  useCallback,
  useId,
  useRef,
  useState,
} from 'react';
import { useSelector } from 'react-redux';

import { commonMessages } from '@codaco/app-i18n/common';
import { AppMessage } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import LocaleSwitcher from '@codaco/fresco-ui/navigation/LocaleSwitcher';
import { usePortalContainer } from '@codaco/fresco-ui/PortalContainer';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import { segmentLayoutSpring } from '@codaco/fresco-ui/SegmentedToolbar';
import { cva, cx } from '@codaco/fresco-ui/utils/cva';

import { navigationMessages as messages } from '../i18n/navigationMessages';
import { useProtocolLocale } from '../localization/ProtocolLocalizationProvider';
import type { UnavailableStage } from '../selectors/skip-logic';
import type { NavigationOrientation } from '../Shell';
import { showPassphrasePrompter } from '../store/modules/ui';
import { useSyncFlush } from '../store/SyncFlushContext';
import { barItemMotion, fadeVariants } from './barMotion';
import PassphrasePrompter from './PassphrasePrompter';
import ReadyToContinueAnnouncer from './ReadyToContinueAnnouncer';
import StagesMenu, { STAGES_MENU_LIST_ID } from './StagesMenu';
import TextSizeControl from './TextSizeControl';

const describeExitError = () => <AppMessage message={messages.exitFailed} />;

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
      staggerChildren: 0.05,
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

// The bar's optional buttons (exit, text size, language) draw their icons a
// little smaller than the back and forward arrows, and dimmed as Back is on
// the first screen, so they stay quieter than Back and Next. Pointed at,
// focused or open, they show at full strength.
const barFeatureIconClassName = cx(
  '[&>.lucide]:h-[1.5em]! [&>.lucide]:opacity-50',
  'hover:[&>.lucide]:opacity-100 focus-visible:[&>.lucide]:opacity-100 aria-expanded:[&>.lucide]:opacity-100',
);

// Icon buttons hold a fixed size, and the bar shrinks the wrapper around them.
// Button already caps its width at the wrapper's; this caps its height too.
const barIconButtonClassName = 'max-h-full';

// IconButton's props are a union, which a plain `Omit` would flatten.
type WithoutRef<T> = T extends unknown ? Omit<T, 'ref'> : never;

/**
 * The back and forward buttons. Their press is heard once the interview has
 * moved (see `useInterviewNavigation`), so a press that is refused is not.
 */
const NavigationButton = ({
  ref,
  disabled,
  className,
  wrapperClassName,
  buttonRef,
  presence = false,
  arrived,
  layoutDependency,
  ...props
}: WithoutRef<ComponentProps<typeof IconButton>> & {
  // `AnimatePresence`'s popLayout mode needs the wrapper's element.
  ref?: Ref<HTMLDivElement>;
  buttonRef?: Ref<HTMLButtonElement>;
  wrapperClassName?: string;
  /** The button can come and go while the bar is on screen. */
  presence?: boolean;
  /** Whether the bar has finished arriving (see `barItemMotion`). */
  arrived: boolean;
  /** Which optional controls the bar shows (see `barItemMotion`). */
  layoutDependency: string;
}) => {
  const reduceMotion = usePrefersReducedMotion() ?? false;
  return (
    <motion.div
      ref={ref}
      {...barItemMotion({ reduceMotion, presence, arrived, layoutDependency })}
      className={wrapperClassName}
    >
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

/**
 * Lets the participant change the interview language from any screen, with
 * the same choice a Language Chooser stage offers. Shown only when the
 * protocol declares more than one language.
 */
const LanguageSwitcherControl = ({
  ref,
  orientation,
  isRtl,
  arrived,
  layoutDependency,
}: {
  ref?: Ref<HTMLDivElement>;
  orientation: NavigationOrientation;
  isRtl: boolean;
  arrived: boolean;
  layoutDependency: string;
}) => {
  const { locale, options, setLocale } = useProtocolLocale();
  const reduceMotion = usePrefersReducedMotion() ?? false;
  if (options.length < 2) return null;

  return (
    <motion.div
      ref={ref}
      {...barItemMotion({
        reduceMotion,
        presence: true,
        arrived,
        layoutDependency,
      })}
      className={barControlVariants({ orientation })}
    >
      <LocaleSwitcher
        options={options}
        value={locale}
        onChange={(next) => {
          if (next !== null) setLocale(next);
        }}
        // oxlint-disable-next-line formatjs/no-literal-string-in-jsx -- screen-reader text stays English
        label="Interview language"
        display="icon"
        icon={<Languages aria-hidden />}
        variant="text"
        color="dynamic"
        size="xl"
        className={cx(barFeatureIconClassName, barIconButtonClassName)}
        // A rail's popover opens away from the screen edge the rail is on.
        side={orientation === 'vertical' ? (isRtl ? 'left' : 'right') : 'top'}
        align="start"
      />
    </motion.div>
  );
};

const navigationVariants = cva({
  base: 'flex max-h-none shrink-0 grow-0 items-center justify-between gap-2 overflow-visible rounded-none shadow-none',
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

// The bar's `gap` spaces the progress bar from its neighbours, as it spaces
// every other control.
const progressContainerClassName = 'flex grow';

/**
 * Participant-selectable text-size multipliers. 1 is the Shell's responsive
 * default; the bounds mirror classic Interviewer's Interface Scale setting.
 * The Shell snaps a host's `initialTextScale` to this list so the stepped
 * control always presents one of these values.
 */
export const TEXT_SCALE_OPTIONS = [0.9, 1, 1.1, 1.2, 1.3];

type NavigationProps = {
  moveBackward: () => void;
  moveForward: () => void;
  disableMoveForward?: boolean;
  disableMoveBackward?: boolean;
  pulseNext: boolean;
  // Identifies the stage and prompt on screen, so the ready sentence is added
  // once for each screen.
  screenId: string;
  progress: number;
  orientation?: NavigationOrientation;
  forwardButtonRef?: Ref<HTMLButtonElement>;
  backButtonRef?: Ref<HTMLButtonElement>;
  onExit?: () => void;
  reviewMode?: boolean;
  allowStageNavigation?: boolean;
  allowUserScaling?: boolean;
  /**
   * Offer the interview's languages from the bar, when the protocol declares
   * more than one. Needs a `ProtocolLocalizationProvider` around it.
   */
  showLanguageSwitcher?: boolean;
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
  screenId,
  progress,
  orientation = 'vertical',
  forwardButtonRef,
  backButtonRef,
  onExit,
  reviewMode,
  allowStageNavigation,
  allowUserScaling,
  showLanguageSwitcher = false,
  textScale = 1,
  onTextScaleChange,
  className,
  goToStage,
}: NavigationProps) => {
  // The Shell lays the navigation out in the interview's direction, so in a
  // right-to-left interview Back sits on the right and points right.
  const direction = useDirection();
  const isRtl = direction === 'rtl';
  /* oxlint-disable direction/inline-arrow-turns -- each arrow is chosen by the direction, so neither is turned as well */
  const BackIcon =
    orientation === 'vertical' ? ChevronUp : isRtl ? ChevronRight : ChevronLeft;
  const ForwardIcon =
    orientation === 'vertical'
      ? ChevronDown
      : isRtl
        ? ChevronLeft
        : ChevronRight;
  /* oxlint-enable direction/inline-arrow-turns */

  const shouldReduceMotion = usePrefersReducedMotion() ?? false;

  const stageNavigationEnabled = !!allowStageNavigation && !!goToStage;

  // The progress bar takes up the length the other controls leave, so it
  // grows and shrinks as they come and go.
  const progressTransition = {
    layout: shouldReduceMotion ? { duration: 0 } : segmentLayoutSpring,
  };

  // The text-size control needs both the opt-in flag and a change handler —
  // one without the other would render a dead control.
  const userScalingEnabled = !!allowUserScaling && !!onTextScaleChange;

  // Names the optional controls on the bar, so every control measures itself
  // again when one comes or goes (see `barItemMotion`).
  const passphrasePrompterShown = useSelector(showPassphrasePrompter);
  const barLayout = [
    onExit && 'exit',
    userScalingEnabled && 'text-size',
    showLanguageSwitcher && 'language',
    passphrasePrompterShown && 'passphrase',
  ]
    .filter(Boolean)
    .join(' ');

  const matchedTextScaleIndex = TEXT_SCALE_OPTIONS.findIndex(
    (scale) => scale === textScale,
  );
  // Shell-provided values are snapped to TEXT_SCALE_OPTIONS. Keep Navigation
  // robust when rendered directly by falling back to the default multiplier.
  const textScaleIndex =
    matchedTextScaleIndex === -1
      ? TEXT_SCALE_OPTIONS.findIndex((scale) => scale === 1)
      : matchedTextScaleIndex;
  const shownTextScale = TEXT_SCALE_OPTIONS[textScaleIndex] ?? 1;
  const readyDescriptionId = useId();

  const { confirm } = useDialog();
  const portalContainer = usePortalContainer();
  const flushPendingSync = useSyncFlush();

  // `menuOpen` drives the drawer panel; `menuSettled` drives the staggered
  // enter/exit of the cards inside it. On open we flip `menuSettled` only once
  // the panel has finished sliding in; on close we flip it first and let the
  // StagesMenu report back (`handleCardsClosed`) once the cards have animated
  // out, so the panel slides away only after — never over — the stagger.
  // Until the bar has arrived, its controls take their animation from it, so
  // that they come in one after another once it is in place (see
  // `barItemMotion`).
  const [barArrived, setBarArrived] = useState(false);

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
              availability.kind === 'bypassed'
                ? messages.outsidePath
                : messages.hiddenScreen
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
            reviewMode ? messages.exitReviewTitle : messages.exitInterview
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
        as="nav"
        className={cx(navigationVariants({ orientation }), className)}
        spacing="xs"
        shadow="xs"
        noContainer
        variants={containerVariants}
        custom={{ orientation, isRtl } satisfies ContainerCustom}
        initial="initial"
        animate="animate"
        exit="exit"
        onAnimationComplete={(definition: unknown) => {
          if (definition === 'animate') setBarArrived(true);
        }}
      >
        {/* Each control that can come and go has its own presence, so it
            leaves the flow at once (popLayout) and the rest glide over. */}
        <AnimatePresence mode="popLayout">
          {onExit && (
            <NavigationButton
              arrived={barArrived}
              layoutDependency={barLayout}
              key="exit"
              presence
              wrapperClassName={barControlVariants({ orientation })}
              className={barFeatureIconClassName}
              onClick={() => void handleExit()}
              icon={<LogOut />}
              // oxlint-disable-next-line formatjs/no-literal-string-in-jsx -- screen-reader text stays English
              aria-label={reviewMode ? 'Exit review' : 'Exit interview'}
              lang="en"
              data-testid="exit-button"
            />
          )}
        </AnimatePresence>
        <AnimatePresence mode="popLayout">
          {userScalingEnabled && (
            <motion.div
              key="text-size"
              {...barItemMotion({
                reduceMotion: shouldReduceMotion,
                presence: true,
                arrived: barArrived,
                layoutDependency: barLayout,
              })}
              className={barControlVariants({ orientation })}
            >
              <TextSizeControl
                scales={TEXT_SCALE_OPTIONS}
                value={shownTextScale}
                onChange={(scale) => onTextScaleChange?.(scale)}
                // A rail's popup opens away from the screen edge the rail is on.
                side={
                  orientation === 'vertical'
                    ? isRtl
                      ? 'left'
                      : 'right'
                    : 'top'
                }
                triggerClassName={cx(
                  barFeatureIconClassName,
                  barIconButtonClassName,
                )}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence mode="popLayout">
          {showLanguageSwitcher && (
            <LanguageSwitcherControl
              arrived={barArrived}
              layoutDependency={barLayout}
              key="language"
              orientation={orientation}
              isRtl={isRtl}
            />
          )}
        </AnimatePresence>
        {/* The bar's features come first, then the progress bar, then Back
            and Next together at the end of the bar, in both orientations. */}
        <PassphrasePrompter
          arrived={barArrived}
          layoutDependency={barLayout}
          orientation={orientation}
          className={barControlVariants({ orientation })}
        />
        {stageNavigationEnabled ? (
          <motion.button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-label="Go to another screen"
            lang="en"
            onClick={() => setMenuOpen(true)}
            variants={fadeVariants}
            layout
            layoutDependency={barLayout}
            transition={progressTransition}
            className={cx(
              progressContainerClassName,
              // Wrap the bar directly so the focus ring hugs its pill shape
              // rather than a rectangular wrapper.
              'focusable cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0',
            )}
          >
            <ProgressBar percentProgress={progress} orientation={orientation} />
          </motion.button>
        ) : (
          <motion.div
            className={progressContainerClassName}
            variants={fadeVariants}
            layout
            layoutDependency={barLayout}
            transition={progressTransition}
          >
            <ProgressBar percentProgress={progress} orientation={orientation} />
          </motion.div>
        )}
        <NavigationButton
          arrived={barArrived}
          layoutDependency={barLayout}
          wrapperClassName={barControlVariants({ orientation })}
          onClick={moveBackward}
          disabled={disableMoveBackward}
          icon={<BackIcon />}
          aria-label="Previous Step"
          lang="en"
          buttonRef={backButtonRef}
          data-testid="previous-button"
        />
        <NavigationButton
          arrived={barArrived}
          layoutDependency={barLayout}
          className={cx(
            pulseNext &&
              'bg-success ui-enabled:hover:bg-success outline-success',
            pulseNext && !shouldReduceMotion && 'animate-pulse-glow',
          )}
          wrapperClassName={barControlVariants({ orientation })}
          onClick={moveForward}
          disabled={disableMoveForward}
          icon={<ForwardIcon className="size-8" strokeWidth="3px" />}
          aria-label="Next Step"
          aria-describedby={pulseNext ? readyDescriptionId : undefined}
          lang="en"
          buttonRef={forwardButtonRef}
          data-testid="next-button"
        />
        <ReadyToContinueAnnouncer
          ready={pulseNext}
          screenId={screenId}
          descriptionId={readyDescriptionId}
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
                aria-label="Go to another screen"
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
