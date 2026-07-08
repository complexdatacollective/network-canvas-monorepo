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
// which replaces any consumer style. Express the width as Tailwind arbitrary classes so it
// survives via the className path (arbitrary values must be static strings so Tailwind can
// see them at build time — never interpolate the pixel value at runtime).
//
// DialogPopup itself applies `tablet-portrait:w-auto w-[calc(100%-var(--spacing-base)*8)]
// max-w-2xl`. At <tablet-portrait our base `w-[calc]` overrides the popup's base width; at
// ≥tablet-portrait the popup switches to `tablet-portrait:w-auto`, so we must re-assert the
// fill width AT the same breakpoint (Tailwind emits responsive variants after base utilities,
// so a bare `w-[…]` here would lose to `tablet-portrait:w-auto` in source order). The result:
// the dialog fills the viewport minus small (4×base = 16px) side margins at every width —
// avoiding max-w-2xl's cramped column on iPad portrait — capped by the max-width on large
// screens.
const WIDTH_FILL =
  'w-[calc(100%-var(--spacing-base)*4)] tablet-portrait:w-[calc(100%-var(--spacing-base)*4)]';

function widthClass(maxWidth: number): string {
  switch (maxWidth) {
    case 1100:
      return `${WIDTH_FILL} max-w-[1100px]`;
    case 1080:
      return `${WIDTH_FILL} max-w-[1080px]`;
    case 1000:
      return `${WIDTH_FILL} max-w-[1000px]`;
    default:
      return `${WIDTH_FILL} max-w-[880px]`;
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
      <DialogPopup className={widthClass(maxWidth)}>
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
