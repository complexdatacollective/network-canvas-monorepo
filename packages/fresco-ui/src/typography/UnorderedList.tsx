import type { ComponentPropsWithoutRef } from 'react';

import { cx } from '../utils/cva';

export function UnorderedList({
  className,
  ...props
}: ComponentPropsWithoutRef<'ul'>) {
  return (
    <ul
      className={cx('ms-8 list-disc not-last:mb-[1em]', className)}
      {...props}
    />
  );
}

export function OrderedList({
  className,
  ...props
}: ComponentPropsWithoutRef<'ol'>) {
  return (
    <ol
      className={cx('ms-8 list-decimal not-last:mb-[1em]', className)}
      {...props}
    />
  );
}
