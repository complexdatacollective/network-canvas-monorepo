import { Drawer } from '@base-ui/react/drawer';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  LogOut,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { type ComponentProps, type Ref, useCallback, useState } from 'react';
import { useSelector } from 'react-redux';

import { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import { usePortalContainer } from '@codaco/fresco-ui/PortalContainer';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { cva, cx } from '@codaco/fresco-ui/utils/cva';

import { useCurrentStep } from '../contexts/CurrentStepContext';
import { getSkipMap } from '../selectors/skip-logic';
import type { NavigationOrientation } from '../Shell';
import { getProtocol } from '../store/modules/protocol';
import PassphrasePrompter from './PassphrasePrompter';
import StagesMenu from './StagesMenu';

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
  buttonRef,
  ...props
}: ComponentProps<typeof IconButton> & {
  buttonRef?: Ref<HTMLButtonElement>;
}) => {
  return (
    <motion.div variants={variants}>
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
  goToStage,
}: NavigationProps) => {
  const BackIcon = orientation === 'vertical' ? ChevronUp : ChevronLeft;
  const ForwardIcon = orientation === 'vertical' ? ChevronDown : ChevronRight;

  const shouldReduceMotion = useReducedMotion();

  const stageNavigationEnabled = !!allowStageNavigation && !!goToStage;

  const { confirm } = useDialog();
  const portalContainer = usePortalContainer();
  const [menuOpen, setMenuOpen] = useState(false);
  const stages = useSelector(getProtocol).stages ?? [];
  const skipMap = useSelector(getSkipMap);
  const { displayedStep } = useCurrentStep();

  const confirmSkip = useCallback(
    () =>
      confirm({
        title: 'Show this stage?',
        description:
          'This stage is normally skipped based on the answers given so far. Do you want to show it anyway?',
        confirmLabel: 'Show stage',
        cancelLabel: 'Cancel',
        intent: 'warning',
        onConfirm: () => {},
      }).then((result) => result === true),
    [confirm],
  );

  const handleSelectStage = useCallback(
    async (index: number) => {
      setMenuOpen(false);
      await goToStage?.(index, confirmSkip);
    },
    [goToStage, confirmSkip],
  );

  return (
    <>
      <MotionSurface
        role="navigation"
        className={navigationVariants({ orientation })}
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
            onClick={onExit}
            icon={<LogOut />}
            className="[&>.lucide]:h-[1.5em]!"
            aria-label="Exit interview"
            data-testid="exit-button"
          />
        )}
        <NavigationButton
          onClick={moveBackward}
          disabled={disableMoveBackward}
          icon={<BackIcon />}
          aria-label="Previous Step"
          buttonRef={backButtonRef}
          data-testid="previous-button"
        />
        {orientation === 'vertical' && <PassphrasePrompter />}
        {stageNavigationEnabled ? (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-label="Go to a stage"
            onClick={() => setMenuOpen(true)}
            className={cx(
              progressContainerVariants({ orientation }),
              'focusable cursor-pointer appearance-none border-0 bg-transparent p-0',
            )}
          >
            <motion.span className="flex grow" variants={variants}>
              <ProgressBar
                percentProgress={progress}
                orientation={orientation}
              />
            </motion.span>
          </button>
        ) : (
          <motion.div
            className={progressContainerVariants({ orientation })}
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
          onOpenChange={setMenuOpen}
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
                className={cx(
                  'bg-surface elevation-medium flex flex-col overflow-hidden transition-transform duration-300 ease-out',
                  'data-swiping:duration-0 motion-reduce:transition-none',
                  orientation === 'vertical'
                    ? 'h-full w-[min(34rem,92vw)] transform-[translateX(var(--drawer-swipe-movement-x,0px))] data-ending-style:transform-[translateX(-100%)] data-starting-style:transform-[translateX(-100%)]'
                    : 'h-[min(85vh,40rem)] w-full transform-[translateY(var(--drawer-swipe-movement-y,0px))] data-ending-style:transform-[translateY(100%)] data-starting-style:transform-[translateY(100%)]',
                )}
              >
                <StagesMenu
                  stages={stages}
                  currentStageIndex={displayedStep}
                  skipMap={skipMap}
                  onSelect={handleSelectStage}
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
