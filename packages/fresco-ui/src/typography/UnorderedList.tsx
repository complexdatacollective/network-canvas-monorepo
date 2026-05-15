import { cx } from '../utils/cva';

export function UnorderedList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ul className={cx('ml-8 list-disc not-last:mb-[1em]', className)}>
      {children}
    </ul>
  );
}

export function OrderedList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ol className={cx('ml-8 list-decimal not-last:mb-[1em]', className)}>
      {children}
    </ol>
  );
}
