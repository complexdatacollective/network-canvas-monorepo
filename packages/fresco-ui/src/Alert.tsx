'use client';

import {
  AlertCircle,
  AlertTriangle,
  Info,
  type LucideIcon,
  PartyPopper,
} from 'lucide-react';
import * as React from 'react';

import Surface from './layout/Surface';
import Heading from './typography/Heading';
import { paragraphVariants } from './typography/Paragraph';
import { cva, cx, type VariantProps } from './utils/cva';

const alertVariants = cva({
  base: 'inset-surface my-6 flex w-full gap-3 rounded last:mb-0',
  variants: {
    variant: {
      default: '',
      // Override the --link primitive (not the --color-link @theme inline alias, which is
      // substituted away at compile time so consumers read var(--link) directly).
      info: 'text-info-contrast [&>svg]:text-info-contrast bg-info [--link:var(--info-contrast)]',
      destructive:
        'text-destructive-contrast [&>svg]:text-destructive-contrast bg-destructive [--link:var(--destructive-contrast)]',
      success:
        'text-success-contrast [&>svg]:text-success-contrast bg-success [--link:var(--success-contrast)]',
      warning:
        'text-warning-contrast [&>svg]:text-warning-contrast bg-warning [--link:var(--warning-contrast)]',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type Variant = NonNullable<VariantProps<typeof alertVariants>['variant']>;

const variantIcons: Record<Variant, LucideIcon | null> = {
  default: null,
  info: Info,
  destructive: AlertCircle,
  success: PartyPopper,
  warning: AlertTriangle,
};

/**
 * Variant → live-region role. `role="alert"` carries implicit
 * aria-live="assertive" + aria-atomic="true" and is reserved for content
 * that must interrupt the user (errors). Everything else uses
 * `role="status"` (implicit aria-live="polite" + aria-atomic="true") so
 * announcements wait for the user to be idle.
 */
const variantRoles: Record<Variant, 'alert' | 'status'> = {
  default: 'status',
  info: 'status',
  success: 'status',
  warning: 'status',
  destructive: 'alert',
};

/**
 * Visually-hidden context prefix announced before the alert content so
 * screen-reader users get the variant's semantic meaning that sighted
 * users get from color + icon. Prepended inside the content block to
 * avoid adding a flex slot (which would inherit the parent gap).
 */
const variantContextLabels: Record<Variant, string> = {
  default: 'Notice',
  info: 'Information',
  success: 'Success',
  warning: 'Warning',
  destructive: 'Error',
};

type AlertProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants> & {
    icon?: LucideIcon | null | false;
  };

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', icon, children, ...props }, ref) => {
    const IconComponent =
      icon === false ? null : (icon ?? variantIcons[variant]);

    return (
      <Surface
        ref={ref}
        role={variantRoles[variant]}
        spacing="sm"
        shadow="sm"
        className={cx(alertVariants({ variant }), className)}
        noContainer
        maxWidth="3xl"
        {...props}
      >
        {IconComponent && (
          <span
            aria-hidden="true"
            // `h-[1lh]` matches one line-height of the inherited text so the
            // icon's slot is exactly one text line tall; `items-center` then
            // centres it against the first line of whatever child renders
            // first, working for both Heading and Paragraph leading children.
            className="tablet-landscape:inline-flex hidden h-lh shrink-0 items-center"
          >
            <IconComponent className="size-4" />
          </span>
        )}
        <div>
          <span className="sr-only">{variantContextLabels[variant]}: </span>
          {children}
        </div>
      </Surface>
    );
  },
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <Heading
    level="h4"
    variant="all-caps"
    ref={ref}
    className={cx('mt-0!', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cx(paragraphVariants(), className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertDescription, AlertTitle };
