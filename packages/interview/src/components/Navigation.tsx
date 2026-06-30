import { Dialog } from '@base-ui/react/dialog';
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
import Modal from '@codaco/fresco-ui/Modal';
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
  /**
   * When true (and `goToStage` is provided), the progress bar becomes a button
   * that opens a stages menu for jumping directly to any stage.
   */
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
  const [menuOpen, setMenuOpen] = useState(false);
  const stages = useSelector(getProtocol).stages ?? [];
  const skipMap = useSelector(getSkipMap);
  const { displayedStep } = useCurrentStep();

  // Mirrors the legacy "Show this stage anyway?" warning. Lives here (inside
  // DialogProvider) and is injected into `goToStage`, which cannot open dialogs
  // itself. Resolves true only when the participant confirms.
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
      // Close first so focus returns to the trigger before any confirm dialog
      // traps it.
      setMenuOpen(false);
      await goToStage?.(index, confirmSkip);
    },
    [goToStage, confirmSkip],
  );

  // The expanding stages menu slides in from the nav's edge: from the left for
  // the vertical rail, from the bottom for the horizontal bar. Reduced motion
  // collapses this to a plain fade.
  const panelHidden = shouldReduceMotion
    ? { opacity: 0 }
    : orientation === 'vertical'
      ? { opacity: 0, x: '-110%' }
      : { opacity: 0, y: '110%' };

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
        {/*
         * The stage `label` (and `interviewScript`) are author-facing only: they
         * are the human-readable stage title / authoring guidance shown in
         * Architect. They are intentionally NOT rendered here in the interview
         * chrome; only progress/navigation affordances are surfaced. This
         * divergence from Architect is deliberate (#663) — do not add the stage
         * title here without a product decision.
         */}
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
        <Modal open={menuOpen} onOpenChange={setMenuOpen}>
          <Dialog.Popup
            render={
              <motion.div
                aria-label="Go to a stage"
                // No border radius and flush to the nav's edge so the panel
                // reads as the navigation surface extending out, not a separate
                // floating card.
                className={cx(
                  'bg-surface elevation-medium flex flex-col overflow-hidden',
                  orientation === 'vertical'
                    ? 'fixed inset-y-0 left-0 w-[min(34rem,92vw)]'
                    : 'fixed inset-x-0 bottom-0 h-[min(85vh,40rem)]',
                )}
                initial={panelHidden}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={panelHidden}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 220, damping: 30 }
                }
              />
            }
          >
            <StagesMenu
              stages={stages}
              currentStageIndex={displayedStep}
              skipMap={skipMap}
              onSelect={handleSelectStage}
            />
          </Dialog.Popup>
        </Modal>
      )}
    </>
  );
};

export default Navigation;
