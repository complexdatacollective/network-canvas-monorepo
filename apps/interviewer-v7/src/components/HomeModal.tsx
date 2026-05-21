import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import type { ReactNode } from 'react';

import CloseButton from '@codaco/fresco-ui/CloseButton';
import DialogPopup from '@codaco/fresco-ui/dialogs/DialogPopup';
import Modal from '@codaco/fresco-ui/Modal';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';

type HomeModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  action?: ReactNode;
  maxWidth?: number;
  children: ReactNode;
  /**
   * Defaults to true. Set false when the consumer renders its own
   * ScrollArea — e.g. a fixed sidebar + scrolling content column.
   */
  scroll?: boolean;
};

// ModalPopup spreads consumer props before applying its own inline style for borderRadius,
// which replaces any consumer style. Express maxWidth as a Tailwind arbitrary class so it
// survives via the className path. Map the discrete values used by callers.
function maxWidthClass(maxWidth: number): string {
  switch (maxWidth) {
    case 1080:
      return 'max-w-[1080px]';
    case 1000:
      return 'max-w-[1000px]';
    default:
      return 'max-w-[880px]';
  }
}

export function HomeModal({
  open,
  onClose,
  title,
  action,
  maxWidth = 880,
  children,
  scroll = true,
}: HomeModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogPopup className={maxWidthClass(maxWidth)}>
        <div className="flex shrink-0 items-center justify-between gap-4 px-8 pt-6">
          <BaseDialog.Title
            render={<div className="flex min-w-0 items-center gap-3.5" />}
          >
            {title}
          </BaseDialog.Title>
          <div className="flex items-center gap-2.5">
            {action}
            <CloseButton onClick={onClose} />
          </div>
        </div>
        {scroll ? (
          <ScrollArea viewportClassName="px-8 pt-6 pb-8">{children}</ScrollArea>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pt-6 pb-8">
            {children}
          </div>
        )}
      </DialogPopup>
    </Modal>
  );
}
