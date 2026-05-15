import { Slot } from '@radix-ui/react-slot';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '~/lib/utils';

const baseButtonClasses = cn(
  'ring-offset-background inline-flex items-center justify-center truncate rounded-full text-xs font-semibold tracking-[3px] text-nowrap uppercase shadow-md transition-colors disabled:pointer-events-none disabled:opacity-50',
  'focusable',
);

const buttonVariants = cva(baseButtonClasses, {
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground hover:bg-primary/90',
      success: 'bg-success text-success-foreground hover:bg-success/90',
      accent: 'bg-accent text-accent-foreground hover:bg-accent/90',
      destructive:
        'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      outline:
        'hover:bg-accent hover:text-accent-foreground border bg-transparent',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      tableHeader: 'hover:text-accent data-[state=open]:text-accent -ml-6',
      link: 'underline-offset-4 shadow-none hover:underline',
      ghost: 'hover:bg-accent hover:text-accent-foreground shadow-none',
    },
    size: {
      'default': 'h-12 px-8',
      'xs': 'h-6 px-3 text-xs',
      'sm': 'h-10 px-4',
      'lg': 'h-12 px-8',
      'icon': 'h-10 w-10',
      'icon-large': 'h-12 w-12',
      'link': 'h-auto px-0',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
  compoundVariants: [
    {
      variant: 'tableHeader',
      size: 'sm',
      className: '-ml-4',
    },
  ],
});

type ButtonProps = {
  variant?: VariantProps<typeof buttonVariants>['variant'];
  size?: VariantProps<typeof buttonVariants>['size'];
  asChild?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
