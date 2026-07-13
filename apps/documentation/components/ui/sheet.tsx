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

import { cx } from '@codaco/fresco-ui/utils/cva';

const Sheet = Root;

const SheetPortal = Portal;

const SheetOverlay = forwardRef<
  ComponentRef<typeof Overlay>,
  ComponentPropsWithoutRef<typeof Overlay>
>(({ className, ...props }, ref) => (
  <Overlay
    className={cx(
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
        left: 'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left phone-landscape:max-w-sm left-0 h-full w-3/4 border-r',
        right:
          'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right phone-landscape:max-w-sm inset-y-0 right-0 h-full w-3/4 border-l',
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
      className={cx(sheetVariants({ side }), className)}
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
    className={cx(
      'phone-landscape:text-left flex flex-col space-y-2 text-center',
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
    className={cx(
      'phone-landscape:flex-row phone-landscape:justify-end phone-landscape:space-x-2 flex flex-col-reverse',
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
    className={cx('text-text text-lg font-semibold', className)}
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
    className={cx('text-sm text-current/70', className)}
    {...props}
  />
));
SheetDescription.displayName = Description.displayName;

export { Sheet, SheetContent, SheetDescription, SheetTitle };
