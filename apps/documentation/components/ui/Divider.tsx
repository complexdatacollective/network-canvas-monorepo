import { cx } from '@codaco/fresco-ui/utils/cva';

export const Divider = ({ className }: { className?: string }) => (
  <hr
    className={cx(
      'border-text mx-auto w-full rounded-full border-[1.5px]',
      className,
    )}
  />
);
