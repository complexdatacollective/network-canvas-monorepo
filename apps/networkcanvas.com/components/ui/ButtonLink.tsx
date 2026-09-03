'use client';

import type { ComponentProps, ReactNode } from 'react';

import { buttonVariants } from '@codaco/fresco-ui/Button';
import { cn } from '~/lib/cn';
import { Link } from '~/lib/i18n/navigation';

type Variants = Parameters<typeof buttonVariants>[0];

type ButtonLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  /** Opens in a new tab with `rel="noreferrer"`. */
  external?: boolean;
  /**
   * Renders a plain anchor without the localised router link — for
   * downloads, `mailto:` and other non-route destinations.
   */
  native?: boolean;
  color?: NonNullable<Variants>['color'];
  size?: NonNullable<Variants>['size'];
  textStyle?: NonNullable<Variants>['textStyle'];
  variant?: NonNullable<Variants>['variant'];
} & Omit<ComponentProps<'a'>, 'href' | 'color'>;

/**
 * A link styled with the fresco-ui button variants. Avoids `<Button asChild>`,
 * whose Slot requires exactly one child and conflicts with the Button's
 * internal icon/children rendering.
 */
export function ButtonLink({
  href,
  children,
  className,
  external,
  native,
  color = 'primary',
  size,
  textStyle,
  variant = 'default',
  ...props
}: ButtonLinkProps) {
  const classes = cn(
    buttonVariants({ color, size, textStyle, variant }),
    className,
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={classes}
        {...props}
      >
        {children}
      </a>
    );
  }

  if (native) {
    return (
      <a href={href} className={classes} {...props}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...props}>
      {children}
    </Link>
  );
}
