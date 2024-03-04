import NextLink, { type LinkProps } from 'next/link';
import { type ReactNode, forwardRef } from 'react';
import { cn } from '~/lib/utils';

const Link = forwardRef<HTMLAnchorElement, LinkProps & { children: ReactNode, className?: string}>((props, ref) => {
  return (
    <NextLink
      ref={ref}
      className={cn("text-link group font-semibold transition-all duration-300 ease-in-out", props.className)}
      {...props}
    >
      <span className="from-link to-link bg-gradient-to-r bg-[length:0%_2px] bg-left-bottom bg-no-repeat pb-[2px] transition-all duration-200 ease-out group-hover:bg-[length:100%_2px]">
        {props.children}
      </span>
    </NextLink>
  );
});

Link.displayName = 'Link';

export default Link;
