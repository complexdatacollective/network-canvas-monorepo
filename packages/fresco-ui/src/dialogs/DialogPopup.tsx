import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import type React from 'react';

import { SurfaceDepthReset, surfaceVariants } from '../layout/Surface';
import ModalPopup from '../Modal/ModalPopup';
import { cx } from '../utils/cva';

export const DIALOG_SIZES = [
  'readable',
  'editor',
  'workspace',
  'fullscreen',
] as const;

export type DialogSize = (typeof DIALOG_SIZES)[number];

const dialogSizeClasses: Record<DialogSize, string> = {
  readable: 'max-w-2xl',
  editor: 'max-w-4xl',
  workspace: 'max-w-7xl',
  fullscreen:
    'h-full max-w-[100rem] @min-[30rem]:h-[calc(100%-var(--spacing-base)*16)] @min-[30rem]:max-h-[64rem]',
};

type DialogPopupProps = React.ComponentProps<typeof ModalPopup> & {
  /**
   * Semantic width suited to the dialog's content. `className` is merged last
   * and remains available for exceptional sizing requirements.
   * @default 'readable'
   */
  size?: DialogSize;
};

export default function DialogPopup({
  children,
  className,
  size = 'readable',
  ...props
}: DialogPopupProps) {
  return (
    <BaseDialog.Viewport className="@container fixed inset-0 flex items-center justify-center overflow-hidden">
      <ModalPopup
        className={cx(
          surfaceVariants({
            floating: true,
            spacing: 'none',
          }),
          // The popover border is a stacked-popover affordance; dialogs sit on a
          // backdrop and stay borderless as before.
          'border-0',
          '@container flex w-full min-w-0 flex-col rounded-none shadow-2xl',
          '@min-[30rem]:max-h-[calc(100%-var(--spacing-base)*10)] @min-[30rem]:w-[calc(100%-var(--spacing-base)*8)] @min-[30rem]:rounded',
          'max-h-full',
          dialogSizeClasses[size],
          className,
        )}
        {...props}
      >
        <SurfaceDepthReset>{children}</SurfaceDepthReset>
      </ModalPopup>
    </BaseDialog.Viewport>
  );
}
