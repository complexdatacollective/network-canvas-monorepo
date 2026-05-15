import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { AnimatePresence } from 'motion/react';
import type { ReactNode } from 'react';

import { DialogBackdrop } from '~/components/NewComponents/DialogBackdrop';

export default function Modal({
  open,
  onOpenChange,
  children,
  forceRender = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  forceRender?: boolean;
}) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <BaseDialog.Portal keepMounted className="z-(--z-dialog)">
            <DialogBackdrop forceRender={forceRender} />
            {children}
          </BaseDialog.Portal>
        )}
      </AnimatePresence>
    </BaseDialog.Root>
  );
}
