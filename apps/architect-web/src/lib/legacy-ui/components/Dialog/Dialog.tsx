import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';

import { cva } from '~/utils/cva';

import Icon from '../Icon';
import Modal from '../Modal';

type DialogType = 'notice' | 'confirm' | 'warning' | 'error' | 'simple';

type DialogProps = {
  children?: ReactNode;
  type?: DialogType;
  icon?: string;
  show?: boolean;
  options?: React.ReactElement[];
  title: string;
  message?: ReactNode;
  onBlur?: () => void;
  classNames?: string;
};

const dialogVariants = cva({
  base: 'bg-surface-1 text-foreground fixed top-1/2 left-1/2 z-(--z-dialog) flex w-xl max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-(--space-lg) rounded-lg border-l-8 p-(--space-lg)',
  variants: {
    type: {
      notice: 'border-l-info',
      confirm: 'border-l-info',
      warning: 'border-l-warning',
      error: 'border-l-error',
      simple: 'border-l-primary',
    },
  },
  defaultVariants: {
    type: 'simple',
  },
});

/*
 * Top level Dialog component, not intended to be used directly, if you need
 * a specific type of Dialog, create in the pattern of Notice
 */
const Dialog = ({
  children,
  type,
  icon,
  show = false,
  options = [],
  title,
  message,
  onBlur = () => {},
  classNames,
}: DialogProps) => (
  <Modal open={show} onOpenChange={() => onBlur()}>
    <BaseDialog.Popup
      render={
        <motion.div
          initial={{ opacity: 0, y: '-10%', scale: 1.1 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            filter: 'blur(0px)',
          }}
          exit={{
            opacity: 0,
            y: '-10%',
            scale: 1.5,
            filter: 'blur(10px)',
          }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30,
          }}
          className={dialogVariants({ type, class: classNames })}
        />
      }
    >
      <div className="flex gap-(--space-lg)">
        {icon && (
          <div className="flex shrink-0 items-center justify-center">
            <Icon name={icon} />
          </div>
        )}
        <div className="min-w-0">
          <h2>{title}</h2>
          {message}
          {children}
        </div>
      </div>
      <footer className="flex justify-end gap-(--space-md)">{options}</footer>
    </BaseDialog.Popup>
  </Modal>
);

export default Dialog;
