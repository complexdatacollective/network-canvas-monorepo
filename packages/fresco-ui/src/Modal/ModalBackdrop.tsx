import { Dialog } from '@base-ui/react/dialog';
import { cx } from 'cva';
import { motion, type Variants } from 'motion/react';

const backdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.25 },
  },
  exit: { opacity: 0 },
};

/**
 * A simple backdrop component for modals and dialogs using Base-UI's Dialog
 * system. Fades in and out using motion.
 *
 * `data-modal-backdrop` marks it in the DOM: the backdrop carries no role and
 * no name, so counting the dimmed layers a stack of modals has put up is the
 * only way a test can state that a nested surface dims what is behind it.
 */
export function ModalBackdrop(props: Dialog.Backdrop.Props) {
  return (
    <Dialog.Backdrop
      data-modal-backdrop=""
      render={
        <motion.div
          variants={backdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className={cx(
            'fixed inset-0',
            'flex items-center justify-center',
            'bg-overlay publish-colors backdrop-blur-xs',
          )}
        />
      }
      {...props}
    />
  );
}
