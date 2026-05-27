'use client';

import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { motion } from 'motion/react';
import type { ComponentProps, ReactNode } from 'react';

import Button from '~/lib/legacy-ui/components/Button';
import Modal from '~/lib/legacy-ui/components/Modal';
import { cx } from '~/utils/cva';

type DialogPopupProps = ComponentProps<typeof motion.div> & {
  size?: 'lg';
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onAnimationComplete?: () => void;
};

function DialogPopup({
  size,
  header,
  children,
  footer,
  className,
  onAnimationComplete,
  ...props
}: DialogPopupProps) {
  return (
    <BaseDialog.Popup
      className={cx(
        'w-3xl',
        'fixed top-1/2 left-1/2 z-(--z-dialog) max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg',
        'bg-surface-1 text-surface-1-foreground flex max-h-[80vh] flex-col',
        'shadow-xl',
        className,
      )}
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
          onAnimationComplete={onAnimationComplete}
          {...props}
        >
          {header && (
            <div className="bg-accent text-accent-foreground sticky top-0 px-(--space-lg) py-(--space-md)">
              {header}
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-(--space-lg) py-(--space-md)">
            {children}
          </div>
          {footer && (
            <div className="bg-accent text-accent-foreground sticky bottom-0 flex justify-end gap-(--space-sm) px-(--space-lg) py-(--space-md) [&>*:first-child:not(:only-child)]:mr-auto">
              {footer}
            </div>
          )}
        </motion.div>
      }
    />
  );
}

function DialogDescription(props: BaseDialog.Description.Props) {
  return (
    <BaseDialog.Description
      className="text-surface-2-foreground text-base"
      {...props}
    />
  );
}

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  header?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: ComponentProps<typeof Button>['color'];
  size?: 'lg';
  onAnimationComplete?: () => void;
} & ComponentProps<typeof motion.div>;

function Dialog({
  open,
  onOpenChange,
  title,
  description,
  header,
  footer,
  children,
  onConfirm,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor = 'sea-green',
  onAnimationComplete,
  ...popupProps
}: DialogProps) {
  const resolvedFooter = footer ?? (
    <>
      <BaseDialog.Close
        nativeButton={false}
        // Cancel closes via Base UI's Close, which fires onOpenChange(false);
        // button / Esc / backdrop all converge on that single handler.
        render={<Button color="platinum">{cancelText}</Button>}
      />
      {onConfirm && (
        <Button onClick={onConfirm} color={confirmColor}>
          {confirmText}
        </Button>
      )}
    </>
  );

  // Headings always live in the accent header bar. A plain `title` string is
  // the common case; `header` overrides it for fully custom header content.
  const resolvedHeader =
    header ??
    (title ? (
      <BaseDialog.Title className="m-0">{title}</BaseDialog.Title>
    ) : undefined);

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        header={resolvedHeader}
        footer={resolvedFooter}
        onAnimationComplete={onAnimationComplete}
        {...popupProps}
      >
        {description && <DialogDescription>{description}</DialogDescription>}
        {children}
      </DialogPopup>
    </Modal>
  );
}

// Attach BaseDialog.Close to Dialog for convenience
type DialogComponent = typeof Dialog & {
  Close: typeof BaseDialog.Close;
};

(Dialog as DialogComponent).Close = BaseDialog.Close;

export default Dialog as DialogComponent;
