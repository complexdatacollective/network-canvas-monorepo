import { useTheme } from 'next-themes';
import Image from 'next/image';
import Link from 'next/link';

import { cx } from '@codaco/fresco-ui/utils/cva';

type LogoComponentProps = {
  invisible?: boolean;
  className?: string;
};

const LogoComponent = ({
  invisible = false,
  className,
}: LogoComponentProps) => {
  const { resolvedTheme } = useTheme();
  return (
    <Link
      href="/"
      className={cx(
        className,
        invisible ? 'invisible' : 'visible',
        'focusable shrink-0 transition-transform duration-1000',
      )}
    >
      <Image
        src="/images/mark.svg"
        alt="Network Canvas Documentation"
        className="tablet-landscape:hidden h-9 w-auto"
        width={36}
        height={36}
      />
      <Image
        src={
          resolvedTheme === 'dark'
            ? '/images/typemark-positive.svg'
            : '/images/typemark-negative.svg'
        }
        alt="Network Canvas Documentation"
        className="tablet-landscape:block hidden h-12 w-auto"
        width={120}
        height={48}
      />
    </Link>
  );
};

export default LogoComponent;
