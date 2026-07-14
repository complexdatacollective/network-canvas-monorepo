import Image from 'next/image';

import { cx } from '@codaco/fresco-ui/utils/cva';

type LogoComponentProps = {
  className?: string;
  variant?: 'responsive' | 'wordmark';
};

const LogoComponent = ({
  className,
  variant = 'responsive',
}: LogoComponentProps) => {
  return (
    <span className={cx('inline-flex shrink-0 items-center', className)}>
      <Image
        src="/images/mark.svg"
        alt=""
        aria-hidden
        className={cx(
          'h-9 w-auto',
          variant === 'responsive' ? 'tablet-landscape:hidden' : 'hidden',
        )}
        width={36}
        height={36}
      />
      <Image
        src="/images/typemark-negative.svg"
        alt=""
        aria-hidden
        className={cx(
          'theme-dark:hidden h-12 w-auto',
          variant === 'responsive' ? 'tablet-landscape:block hidden' : 'block',
        )}
        width={120}
        height={48}
      />
      <Image
        src="/images/typemark-positive.svg"
        alt=""
        aria-hidden
        className={cx(
          'h-12 w-auto',
          variant === 'responsive'
            ? 'theme-dark:tablet-landscape:block hidden'
            : 'theme-dark:block hidden',
        )}
        width={120}
        height={48}
      />
    </span>
  );
};

export default LogoComponent;
