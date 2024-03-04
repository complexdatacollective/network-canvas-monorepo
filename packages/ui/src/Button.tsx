import type { VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';

import { cn } from './utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center truncate text-nowrap rounded-full text-xs font-semibold uppercase tracking-[3px] text-foreground ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        success: 'bg-success text-success-foreground hover:bg-success/90',
        accent: 'bg-accent text-accent-foreground hover:bg-accent/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border bg-transparent hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:text-accent',
        tableHeader: '-ml-6 hover:text-accent data-[state=open]:text-accent',
        link: 'underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-12 px-8',
        xs: 'h-6 px-3 text-xs',
        sm: 'h-10 px-4',
        lg: 'h-12 px-8',
        icon: 'h-10 w-10',
        link: 'h-auto px-0',
      },
      shadow: {
        default: 'shadow-md',
        none: 'shadow-none',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      shadow: 'default',
    },
    compoundVariants: [
      {
        variant: 'tableHeader',
        size: 'sm',
        className: '-ml-4',
      },
      {
        variant: 'link',
        size: 'link',
        shadow: 'none',
      },
    ],
  },
);

export type ButtonProps = {
  variant?: VariantProps<typeof buttonVariants>['variant'];
  size?: VariantProps<typeof buttonVariants>['size'];
  shadow?: VariantProps<typeof buttonVariants>['shadow'];
  asChild?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, shadow, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, shadow, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
