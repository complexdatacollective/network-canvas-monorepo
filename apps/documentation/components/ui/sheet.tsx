'use client';

import {
  Content,
  Description,
  Overlay,
  Portal,
  Root,
  Title,
} from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  type ComponentPropsWithoutRef,
  type ComponentRef,
  forwardRef,
  type HTMLAttributes,
} from 'react';

import { cn } from '~/lib/utils';

const Sheet = Root;

const SheetPortal = Portal;

const SheetOverlay = forwardRef<
  ComponentRef<typeof Overlay>,
  ComponentPropsWithoutRef<typeof Overlay>
>(({ className, ...props }, ref) => (
  <Overlay
    className={cn(
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-40 bg-black/5 backdrop-blur-lg',
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = Overlay.displayName;

const sheetVariants = cva(
  'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 gap-4 p-3 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
  {
    variants: {
      side: {
        top: 'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 border-b',
        bottom:
          'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 border-t',
        left: 'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left left-0 h-full w-3/4 border-r sm:max-w-sm',
        right:
          'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  },
);

type SheetContentProps = object &
  ComponentPropsWithoutRef<typeof Content> &
  VariantProps<typeof sheetVariants>;

const SheetContent = forwardRef<
  ComponentRef<typeof Content>,
  SheetContentProps
>(({ side = 'right', className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      {children}
    </Content>
  </SheetPortal>
));
SheetContent.displayName = Content.displayName;

const SheetHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-2 text-center sm:text-left',
      className,
    )}
    {...props}
  />
);
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className,
    )}
    {...props}
  />
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = forwardRef<
  ComponentRef<typeof Title>,
  ComponentPropsWithoutRef<typeof Title>
>(({ className, ...props }, ref) => (
  <Title
    ref={ref}
    className={cn('text-foreground text-lg font-semibold', className)}
    {...props}
  />
));
SheetTitle.displayName = Title.displayName;

const SheetDescription = forwardRef<
  ComponentRef<typeof Description>,
  ComponentPropsWithoutRef<typeof Description>
>(({ className, ...props }, ref) => (
  <Description
    ref={ref}
    className={cn('text-muted-foreground text-sm', className)}
    {...props}
  />
));
SheetDescription.displayName = Description.displayName;

export { Sheet, SheetContent };
