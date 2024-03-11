import Image from 'next/image';
import Link from 'next/link';
import { cn } from '~/lib/utils';

type LogoComponentProps = {
  invisible?: boolean;
  className?: string;
};

const LogoComponent = ({
  invisible = false,
  className,
}: LogoComponentProps) => {
  return (
    <Link
      href="/"
      className={cn(
        className,
        invisible ? 'invisible' : 'visible',
        'focusable flex-shrink-0 transition-transform duration-1000',
      )}
    >
      <Image
        src="/images/mark.svg"
        alt="Network Canvas Documentation"
        width={48}
        height={48}
        className="h-9 w-auto lg:hidden"
        priority
      />
      <Image
        src="/images/typemark-negative.svg"
        alt="Network Canvas Documentation"
        height={48} //5.27
        width={275}
        className="hidden h-12 w-auto lg:block"
      />
    </Link>
  );
};

export default LogoComponent;
