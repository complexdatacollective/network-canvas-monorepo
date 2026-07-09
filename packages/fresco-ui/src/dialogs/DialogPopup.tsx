import { SurfaceDepthReset, surfaceVariants } from '../layout/Surface';
import ModalPopup from '../Modal/ModalPopup';
import { cx } from '../utils/cva';

export default function DialogPopup({
  children,
  className,
  ...props
}: React.ComponentProps<typeof ModalPopup>) {
  return (
    <ModalPopup
      className={cx(
        surfaceVariants({
          floating: true,
          spacing: 'none',
        }),
        // The popover border is a stacked-popover affordance; dialogs sit on a
        // backdrop and stay borderless as before.
        'border-0',
        'tablet-portrait:w-fit tablet-portrait:max-w-[calc(100vw-var(--spacing-base)*10)] w-[calc(100%-var(--spacing-base)*8)] max-w-[calc(100vw-var(--spacing-base)*8)] shadow-2xl',
        'fixed top-1/2 left-1/2 -translate-1/2',
        'flex max-h-[calc(100vh-var(--spacing-base)*10)] flex-col',
        className,
      )}
      {...props}
    >
      <SurfaceDepthReset>{children}</SurfaceDepthReset>
    </ModalPopup>
  );
}
