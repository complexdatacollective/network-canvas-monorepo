import { useTheme } from 'next-themes';
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
  const { resolvedTheme } = useTheme();
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
        src={
          resolvedTheme === 'dark'
            ? '/images/typemark-positive.svg'
            : '/images/typemark-negative.svg'
        }
        alt=""
        aria-hidden
        className={cx(
          'h-12 w-auto',
          variant === 'responsive' ? 'tablet-landscape:block hidden' : 'block',
        )}
        width={120}
        height={48}
      />
    </span>
  );
};

export default LogoComponent;
