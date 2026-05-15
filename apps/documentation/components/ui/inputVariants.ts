import { cva } from 'class-variance-authority';

import { cn } from '~/lib/utils';

const inputClasses = cn(
  'text-input-foreground rounded-input border-border bg-input ring-offset-background flex h-10 w-full border',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
  'placeholder:text-muted-foreground',
  'file:border-0 file:bg-transparent file:text-sm file:font-medium',
);

export const inputVariants = cva(inputClasses, {
  variants: {
    size: {
      'default': 'h-10 px-3 py-2 text-sm [&.adornment-left]:mr-2',
      'lg': 'h-12 px-4 py-3 text-base [&.adornment-left]:mr-4',
      'xl': 'h-14 px-5 py-4 text-lg [&.adornment-left]:mr-5',
      '2xl': 'h-16 px-6 py-5 text-xl [&.adornment-left]:mr-6',
      '3xl': 'h-20 px-8 py-6 text-2xl [&.adornment-left]:mr-8',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});
