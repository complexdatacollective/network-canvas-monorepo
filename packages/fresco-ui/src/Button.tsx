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
  squareSizeVariants,
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
    'font-heading inline-flex cursor-pointer border-0 font-bold tracking-wide',
    // A button must never force its container to overflow.
    // `max-w-full` caps it even where nothing
    // shrinks it. Buttons that genuinely must hold their size — icon buttons
    // (below), toolbar actions — say so with `shrink-0` at the call site.
    'max-w-full min-w-0',
    'items-center justify-center',
    'ui-disabled:cursor-not-allowed ui-disabled:opacity-50',
    // Toggle and disclosure buttons carry their state in ARIA, so the selected
    // look follows the attribute. Deliberately NOT `!important`: a call site
    // that wants a different selected treatment must be able to say so with a
    // class, and `!important` here is what made `CollectionSortButton`'s
    // `bg-accent` dead code. A control whose selection is NOT an ARIA state —
    // a menu trigger, which is `aria-expanded`/`aria-haspopup` and must never
    // also claim to be a toggle — uses the `selected` prop instead.
    //
    // These are low-specificity on purpose, so the hover repaint they lose to
    // is withheld rather than outranked — see `hasAriaSelectedState`.
    'aria-pressed:border-selected aria-pressed:bg-selected aria-pressed:text-selected-contrast',
    'aria-expanded:border-selected aria-expanded:bg-selected aria-expanded:text-selected-contrast',
    'focusable',
    'elevation-low',
    'ui-enabled:active:elevation-none ui-enabled:active:translate-y-[2px]',
    'transition-[background-color,border-color,border-width,color,box-shadow,opacity,translate] duration-150',
  ),
  variants: {
    variant: {
      'default': 'bg-(--component-text) text-(--component-bg)',
      'default-inverted': 'bg-white text-(--component-text)',
      'raised':
        'ui-enabled:hover:elevation-medium ui-enabled:hover:-translate-y-0.5 ui-enabled:active:border-b-transparent border-(--component-raised-edge) bg-(--component-text) tracking-widest text-(--component-bg) uppercase [--component-raised-edge:color-mix(in_oklab,var(--component-text)_78%,var(--color-black)_22%)]',
      // The hover repaint these four share is NOT here: it is a compound
      // variant below, so a selected control can be given it by omission.
      'outline': 'border-2 border-(--component-text) text-(--component-text)',
      'text': 'text-(--component-text)',
      'dashed':
        'border-2 border-dashed border-(--component-text) text-(--component-text)',
      'glass':
        'control-glass border-(--component-text) text-(--component-text)',
      'link': cx(
        NATIVE_LINK_ROOT_CLASS_NAME,
        'font-body elevation-none hover:elevation-none! ui-disabled:[&>span]:bg-[length:0%_2px]! h-auto! overflow-visible p-0! tracking-normal hover:translate-none! active:translate-none!',
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
    /**
     * Renders the selected treatment without claiming an ARIA state.
     *
     * As a PROP, this is for a control that is visually "active" but is not
     * selected in the accessibility tree: a menu trigger whose column is
     * sorted is not a toggle button, and saying `aria-pressed` to get the
     * colour announces a pressed state that activating it does not change. A
     * control that IS selected in the tree uses `aria-pressed` (a toggle) or
     * `aria-expanded` (a disclosure) and lets the base rules above colour it.
     *
     * As a VARIANT, it means "showing a selected treatment, from any of the
     * three" — `Button` sets it from the ARIA states too, because the hover
     * repaint has to be withheld for all of them alike.
     */
    selected: {
      true: 'border-selected bg-selected text-selected-contrast',
      false: '',
    },
  },
  defaultVariants: {
    variant: 'default',
    color: 'default',
    iconPosition: 'left',
    size: 'md',
    // Required, not cosmetic: a compound variant keyed on `selected: false`
    // does not match an absent prop, so without this default every direct
    // `buttonVariants()` caller would silently lose the hover repaint.
    selected: false,
  },
  compoundVariants: [
    // Hover inverts these four to their own text colour — but only while the
    // control is not already wearing the selected treatment. Once a toggle is
    // on or a disclosure is open, the colour is carrying state, and hover has
    // nothing left to say; repainting it over the top just discards the state.
    //
    // Withheld rather than guarded, and that distinction is the whole reason
    // this sits in a compound variant. See `hasAriaSelectedState`.
    {
      variant: ['outline', 'text', 'dashed', 'glass'],
      selected: false,
      className:
        'ui-enabled:hover:bg-(--component-text) ui-enabled:hover:text-(--component-bg)',
    },
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
        'interview:[--component-text:var(--neutral)] ui-enabled:hover:[--component-text:var(--neutral)] [--component-text:var(--neutral-contrast)]',
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
        'ui-enabled:hover:border-b-4 ui-enabled:active:translate-y-0.75 ui-enabled:active:border-b-3 border-b-3 text-xs',
    },
    {
      variant: 'raised',
      size: 'md',
      className:
        'ui-enabled:hover:border-b-5 ui-enabled:active:translate-y-1 ui-enabled:active:border-b-4 border-b-4 text-sm',
    },
    {
      variant: 'raised',
      size: 'lg',
      className:
        'ui-enabled:hover:border-b-6 ui-enabled:active:translate-y-1.25 ui-enabled:active:border-b-5 border-b-5 text-base',
    },
    {
      variant: 'raised',
      size: 'xl',
      className:
        'ui-enabled:hover:border-b-8 ui-enabled:active:translate-y-1.5 ui-enabled:active:border-b-6 border-b-6 text-lg',
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

/**
 * Whether the ARIA state says this control is already selected, which is what
 * the `selected` variant needs to know to withhold the hover repaint.
 *
 * Read as PROPS rather than matched with a `not-aria-pressed:` variant on the
 * hover utilities, and that is the load-bearing part. A guard changes a
 * utility's modifier chain, and `tailwind-merge` only collapses two classes
 * that share one — so a guarded `ui-enabled:hover:bg-…` stops merging with a
 * call site's own `ui-enabled:hover:bg-success`, both survive, and the guard's
 * extra `:not()`s outrank the call site. That is exactly how the interview's
 * "next" button lost its green: it is navigated by clicking, so the pointer is
 * still resting on it when the next stage renders. Withholding the utility
 * leaves nothing to outrank.
 *
 * It also leaves a call site's own selected treatment unopposed, which a
 * higher-specificity override would trample: `PresetSwitcher` deliberately
 * tints its open trigger `aria-expanded:bg-selected/15` instead of taking the
 * full-strength fill, and that trigger sits open for a whole stage.
 *
 * `"mixed"` and `"false"` are not selected, matching the `aria-pressed:` and
 * `aria-expanded:` variants, which compile to `[aria-…="true"]`. A control
 * that acquires the attribute outside React — or precomputes its classes at
 * module scope, as `RichTextEditor`'s toolbar does — keeps the old behaviour
 * rather than breaking.
 */
const hasAriaSelectedState = ({
  'aria-pressed': pressed,
  'aria-expanded': expanded,
}: React.AriaAttributes) =>
  pressed === true ||
  pressed === 'true' ||
  expanded === true ||
  expanded === 'true';

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
      selected,
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
      // Either source counts. `selected={false}` on a control that is also an
      // open disclosure describes the prop's own concern, not the ARIA one.
      selected: selected || hasAriaSelectedState(props),
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

/**
 * An icon carries no text, so the button has to be named some other way — and
 * exactly one of the two ways of doing it must be present. `aria-label` is the
 * usual one; `aria-labelledby` is for a button whose name is already on the
 * page (a row's delete control naming the row it deletes), where repeating the
 * text in an attribute would let the two drift apart.
 */
type IconButtonAccessibleName =
  | { 'aria-label': string; 'aria-labelledby'?: string }
  | { 'aria-label'?: string; 'aria-labelledby': string };

type IconButtonProps = Omit<
  ButtonProps,
  | 'icon'
  | 'children'
  | 'iconPosition'
  | 'color'
  | 'textStyle'
  | 'aria-label'
  | 'aria-labelledby'
> &
  IconButtonAccessibleName & {
    icon: React.ReactNode;
    color?:
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
  // The width is stated explicitly per size (squareSizeVariants) rather than
  // left to `aspect-square` × height: shipped Safari computes 0 for a flex
  // item's ratio-derived width inside nested flex rows, collapsing the
  // control to nothing. The ratio stays as intent (and covers non-flex
  // hosts); the explicit width is what every engine honours.
  squareSizeVariants,
  cva({
    // `shrink-0` restores the floor Button gives up: an icon button's width
    // is fixed, so letting a crowded flex row squash it would squash the
    // target itself, not a label.
    base: 'aspect-square shrink-0 justify-center rounded-full p-0!',
  }),
);

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      className,
      size = 'md',
      variant,
      color,
      selected,
      type = 'button',
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cx(
          iconButtonVariants({
            size,
            variant,
            color,
            selected: selected || hasAriaSelectedState(props),
          }),
          className,
        )}
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
