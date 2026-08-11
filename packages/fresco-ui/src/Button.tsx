'use client';

import { Slot, Slottable } from '@radix-ui/react-slot';
import { motion } from 'motion/react';
import * as React from 'react';

import { Skeleton } from './Skeleton';
import {
  controlVariants,
  heightVariants,
  inlineSpacingVariants,
  proportionalLucideIconVariants,
  textSizeVariants,
  wrapperPaddingVariants,
} from './styles/controlVariants';
import {
  NATIVE_LINK_LABEL_CLASS_NAME,
  NATIVE_LINK_ROOT_CLASS_NAME,
} from './styles/nativeLinkStyles';
import { compose, cva, cx, type VariantProps } from './utils/cva';

const buttonSpecificVariants = cva({
  base: cx(
    'font-heading inline-flex shrink-0 cursor-pointer border-0 font-bold tracking-wide',
    'items-center justify-center',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'focusable',
    'elevation-low',
    'not-disabled:active:elevation-none not-disabled:active:translate-y-[2px]',
    'transition-[background-color,border-color,border-width,color,box-shadow,opacity,translate] duration-150',
  ),
  variants: {
    variant: {
      'default': 'bg-(--component-text) text-(--component-bg)',
      'default-inverted': 'bg-white text-(--component-text)',
      'raised':
        'not-disabled:hover:elevation-medium border-(--component-raised-edge) bg-(--component-text) tracking-widest text-(--component-bg) uppercase [--component-raised-edge:color-mix(in_oklab,var(--component-text)_78%,var(--color-black)_22%)] not-disabled:hover:-translate-y-0.5 not-disabled:active:border-b-transparent',
      'outline':
        'border-2 border-(--component-text) text-(--component-text) hover:enabled:bg-(--component-text) hover:enabled:text-(--component-bg)',
      'text':
        'text-(--component-text) hover:enabled:bg-(--component-text) hover:enabled:text-(--component-bg)',
      'dashed':
        'border-2 border-dashed border-(--component-text) text-(--component-text) hover:enabled:bg-(--component-text) hover:enabled:text-(--component-bg)',
      'glass':
        'control-glass border-(--component-text) text-(--component-text) hover:enabled:bg-(--component-text) hover:enabled:text-(--component-bg)',
      'link': cx(
        NATIVE_LINK_ROOT_CLASS_NAME,
        'font-body elevation-none hover:elevation-none! h-auto! overflow-visible p-0! tracking-normal hover:translate-none! active:translate-none! disabled:[&>span]:bg-[length:0%_2px]!',
      ),
    },
    textStyle: {
      default: 'tracking-wide normal-case',
      uppercase: 'tracking-widest uppercase',
    },
    size: {
      sm: '',
      md: '',
      lg: '',
      xl: '',
    },
    color: {
      default:
        '[--component-bg:var(--neutral-contrast)] [--component-text:var(--neutral)]',
      dynamic:
        'text-current [--component-bg:currentColor] [--component-text:color-mix(in_oklab,var(--published-bg,--background),currentColor_8%)]',
      primary:
        'focus:outline-primary [--component-bg:var(--primary-contrast)] [--component-text:var(--primary)]',
      secondary:
        'focus:outline-secondary [--component-bg:var(--secondary-contrast)] [--component-text:var(--secondary)]',
      warning:
        'focus:outline-warning [--component-bg:var(--warning-contrast)] [--component-text:var(--warning)]',
      info: 'focus:outline-info [--component-bg:var(--info-contrast)] [--component-text:var(--info)]',
      destructive:
        'focus:outline-destructive [--component-bg:var(--destructive-contrast)] [--component-text:var(--destructive)]',
      success:
        'focus:outline-success [--component-bg:var(--success-contrast)] [--component-text:var(--success)]',
      accent:
        'focus:outline-accent [--component-bg:var(--accent-contrast)] [--component-text:var(--accent)]',
    },
    iconPosition: {
      left: 'flex-row',
      right: 'flex-row-reverse',
    },
  },
  defaultVariants: {
    variant: 'default',
    color: 'default',
    iconPosition: 'left',
    size: 'md',
  },
  compoundVariants: [
    // When in interview mode, use the button color for outline, because text has no contrast with bg
    {
      variant: 'default',
      color: 'default',
      className: 'interview:outline-(--component-text)',
    },
    // Default color bg is too light to use as outline or text color
    {
      variant: ['outline', 'text', 'dashed', 'glass'],
      color: 'default',
      className:
        'interview:[--component-text:var(--neutral)] [--component-text:var(--neutral-contrast)] hover:enabled:[--component-text:var(--neutral)]',
    },
    {
      variant: ['outline', 'dashed', 'glass'],
      color: ['dynamic', 'default'],
      className: 'border-current',
    },
    {
      variant: ['text', 'link'],
      className: 'elevation-none',
    },
    {
      variant: 'raised',
      size: 'sm',
      className:
        'border-b-3 text-xs not-disabled:hover:border-b-4 not-disabled:active:translate-y-0.75 not-disabled:active:border-b-3',
    },
    {
      variant: 'raised',
      size: 'md',
      className:
        'border-b-4 text-sm not-disabled:hover:border-b-5 not-disabled:active:translate-y-1 not-disabled:active:border-b-4',
    },
    {
      variant: 'raised',
      size: 'lg',
      className:
        'border-b-5 text-base not-disabled:hover:border-b-6 not-disabled:active:translate-y-1.25 not-disabled:active:border-b-5',
    },
    {
      variant: 'raised',
      size: 'xl',
      className:
        'border-b-6 text-lg not-disabled:hover:border-b-8 not-disabled:active:translate-y-1.5 not-disabled:active:border-b-6',
    },
    {
      textStyle: 'uppercase',
      size: 'sm',
      className: 'text-xs',
    },
    {
      textStyle: 'uppercase',
      size: 'md',
      className: 'text-sm',
    },
    {
      textStyle: 'uppercase',
      size: 'lg',
      className: 'text-base',
    },
    {
      textStyle: 'uppercase',
      size: 'xl',
      className: 'text-lg',
    },
    {
      variant: 'raised',
      textStyle: 'default',
      size: 'sm',
      className: 'text-sm',
    },
    {
      variant: 'raised',
      textStyle: 'default',
      size: 'md',
      className: 'text-base',
    },
    {
      variant: 'raised',
      textStyle: 'default',
      size: 'lg',
      className: 'text-lg',
    },
    {
      variant: 'raised',
      textStyle: 'default',
      size: 'xl',
      className: 'text-xl',
    },
  ],
});

const buttonVariants = compose(
  heightVariants,
  textSizeVariants,
  proportionalLucideIconVariants,
  controlVariants,
  inlineSpacingVariants,
  wrapperPaddingVariants,
  buttonSpecificVariants,
);

type BaseButtonProps = {
  variant?: VariantProps<typeof buttonVariants>['variant'];
  textStyle?: VariantProps<typeof buttonVariants>['textStyle'];
  asChild?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  Omit<VariantProps<typeof buttonVariants>, 'color'> &
  BaseButtonProps & {
    color?:
      | 'default'
      | 'dynamic'
      | 'primary'
      | 'secondary'
      | 'warning'
      | 'info'
      | 'destructive'
      | 'success';
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      color,
      size,
      asChild = false,
      children,
      icon,
      iconPosition = 'left',
      textStyle,
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const isLinkVariant = variant === 'link';
    const classes = buttonVariants({
      variant,
      color,
      size,
      iconPosition,
      textStyle,
      className,
    });

    if (asChild) {
      const slottedChild =
        isLinkVariant &&
        React.isValidElement<{ children?: React.ReactNode }>(children)
          ? React.cloneElement(
              children,
              undefined,
              <span className={NATIVE_LINK_LABEL_CLASS_NAME}>
                {children.props.children}
              </span>,
            )
          : children;

      return (
        <Slot className={classes} ref={ref} {...props}>
          {icon}
          <Slottable>{slottedChild}</Slottable>
        </Slot>
      );
    }

    return (
      <button type={type} className={classes} ref={ref} {...props}>
        {icon}
        {isLinkVariant ? (
          <span className={NATIVE_LINK_LABEL_CLASS_NAME}>{children}</span>
        ) : (
          children
        )}
      </button>
    );
  },
);
Button.displayName = 'Button';

type IconButtonProps = Omit<
  ButtonProps,
  'icon' | 'children' | 'iconPosition' | 'color' | 'textStyle'
> & {
  'icon': React.ReactNode;
  'aria-label': string;
  'color'?:
    | 'default'
    | 'dynamic'
    | 'primary'
    | 'secondary'
    | 'warning'
    | 'info'
    | 'destructive'
    | 'success'
    | 'accent';
};

const iconButtonVariants = compose(
  buttonVariants,
  cva({
    base: 'aspect-square justify-center rounded-full p-0!',
  }),
);

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { icon, className, size = 'md', variant, color, type = 'button', ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cx(iconButtonVariants({ size, variant, color }), className)}
        {...props}
      >
        {icon}
      </button>
    );
  },
);
IconButton.displayName = 'IconButton';

const ButtonSkeleton = (props: ButtonProps) => {
  const classes = cx(
    buttonVariants({
      variant: props.variant,
      color: props.color,
      size: props.size,
      textStyle: props.textStyle,
    }),
    props.className,
  );

  return <Skeleton className={classes} />;
};

export default Button;

export {
  Button,
  ButtonSkeleton,
  buttonVariants,
  IconButton,
  iconButtonVariants,
};

const MotionButton = motion.create(Button);

export { MotionButton };
