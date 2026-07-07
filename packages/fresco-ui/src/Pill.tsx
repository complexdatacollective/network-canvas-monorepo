import * as React from 'react';

import { cva, type VariantProps } from './utils/cva';

export const pillVariants = cva({
  // border is ALWAYS present (transparent by default) so the border-box is
  // identical across variants — toggling background/border never reflows the
  // pill or its neighbours.
  base: 'font-monospace inline-flex items-center rounded-full border border-transparent whitespace-nowrap',
  variants: {
    size: {
      sm: 'gap-1 px-2 py-0.5 text-xs',
      md: 'gap-1.5 px-2.5 py-1 text-xs',
      lg: 'gap-2 px-3 py-1.5 text-sm',
    },
    variant: {
      ghost: '',
      filled: 'bg-current/10',
      outline: 'border-current/25',
    },
  },
  defaultVariants: { size: 'md', variant: 'ghost' },
});

type PillOwnProps = VariantProps<typeof pillVariants> & {
  as?: 'span' | 'button';
  icon?: React.ReactNode;
};

export type PillProps = PillOwnProps &
  React.HTMLAttributes<HTMLElement> &
  Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'disabled'>;

const Pill = React.forwardRef<HTMLElement, PillProps>(function Pill(
  {
    as = 'span',
    size,
    variant,
    icon,
    className,
    children,
    type,
    disabled,
    ...props
  },
  ref,
) {
  // A single callback ref forwards to either concrete element without a cast:
  // a function taking HTMLElement is assignable to both span and button ref
  // slots, and HTMLButtonElement/HTMLSpanElement widen to HTMLElement.
  const setRef = (node: HTMLElement | null) => {
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  const classes = pillVariants({ size, variant, className });

  if (as === 'button') {
    return (
      <button
        ref={setRef}
        type={type ?? 'button'}
        disabled={disabled}
        className={classes}
        {...props}
      >
        {icon}
        {children}
      </button>
    );
  }

  return (
    <span ref={setRef} className={classes} {...props}>
      {icon}
      {children}
    </span>
  );
});
Pill.displayName = 'Pill';

export default Pill;
