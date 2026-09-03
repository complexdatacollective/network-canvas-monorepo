import * as React from 'react';

import { cva, type VariantProps } from './utils/cva';

export const pillVariants = cva({
  // border is ALWAYS present (transparent by default) so the border-box is
  // identical across variants — toggling background/border never reflows the
  // pill or its neighbours.
  base: 'font-monospace inline-flex items-center rounded-full border border-transparent whitespace-nowrap',
  variants: {
    size: {
      // The label sits in a cap-trimmed span, so where the trim is supported
      // the vertical padding is the whole of the space around the caps rather
      // than a top-up on a line box; an icon taller than the caps sizes its
      // pill instead. Without the trim the padding is what it was.
      sm: 'text-box-trimmed:py-1.5 gap-1 px-2 py-0.5 text-xs',
      md: 'text-box-trimmed:py-2 gap-1.5 px-2.5 py-1 text-xs',
      lg: 'text-box-trimmed:py-2.5 gap-2 px-3 py-1.5 text-sm',
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
        <span className="text-box-trim">{children}</span>
      </button>
    );
  }

  return (
    <span ref={setRef} className={classes} {...props}>
      {icon}
      {/* `text-box-trim` is inert on the inline-flex pill; the span takes it. */}
      <span className="text-box-trim">{children}</span>
    </span>
  );
});
Pill.displayName = 'Pill';

export default Pill;
