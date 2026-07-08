import { Drawer } from '@base-ui/react/drawer';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  LogOut,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  type ComponentProps,
  type Ref,
  useCallback,
  useRef,
  useState,
} from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import { usePortalContainer } from '@codaco/fresco-ui/PortalContainer';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { cva, cx } from '@codaco/fresco-ui/utils/cva';

import type { NavigationOrientation } from '../Shell';
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
  allowStageNavigation?: boolean;
  /** Extra classes for the navigation surface, e.g. a host applying
   * device-specific safe-area padding. Merged after the orientation variant. */
  className?: string;
  goToStage?: (
    targetIndex: number,
    confirmSkip?: () => Promise<boolean>,
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
  allowStageNavigation,
  className,
  goToStage,
}: NavigationProps) => {
  const BackIcon = orientation === 'vertical' ? ChevronUp : ChevronLeft;
  const ForwardIcon = orientation === 'vertical' ? ChevronDown : ChevronRight;

  const shouldReduceMotion = useReducedMotion();

  const stageNavigationEnabled = !!allowStageNavigation && !!goToStage;

  const { confirm } = useDialog();
  const portalContainer = usePortalContainer();

  // `menuOpen` drives the drawer panel; `menuSettled` drives the staggered
  // enter/exit of the cards inside it. On open we flip `menuSettled` only once
  // the panel has finished sliding in; on close we flip it first and let the
  // StagesMenu report back (`handleCardsClosed`) once the cards have animated
  // out, so the panel slides away only after — never over — the stagger.
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSettled, setMenuSettled] = useState(false);
  const pendingStageRef = useRef<number | null>(null);

  const confirmSkip = useCallback(
    async () =>
      (await confirm({
        title: 'Show this stage?',
        description:
          'This stage is normally skipped based on the answers given so far. Do you want to show it anyway?',
        confirmLabel: 'Show stage',
        cancelLabel: 'Cancel',
        intent: 'warning',
        onConfirm: () => {},
      })) === true,
    [confirm],
  );

  const handleExit = useCallback(async () => {
    if (!onExit) return;
    const confirmed = await confirm({
      title: 'Exit this interview?',
      description:
        'Your answers so far will be saved and you can continue later.',
      confirmLabel: 'Exit interview',
      cancelLabel: 'Cancel',
      intent: 'warning',
      onConfirm: () => {},
    });
    if (confirmed === true) {
      onExit();
    }
  }, [confirm, onExit]);

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
        {onExit && (
          <NavigationButton
            onClick={() => void handleExit()}
            icon={<LogOut />}
            className="[&>.lucide]:h-[1.5em]!"
            wrapperClassName={
              orientation === 'horizontal' ? 'order-1' : undefined
            }
            aria-label="Exit interview"
            data-testid="exit-button"
          />
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
            aria-label="Go to a stage"
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
            pulseNext && 'bg-success hover:enabled:bg-success outline-success',
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
              void goToStage?.(target, confirmSkip);
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
                aria-label="Go to a stage"
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
