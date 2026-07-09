'use client';

import { type LucideIcon, PartyPopper } from 'lucide-react';
import { motion, useAnimation, useReducedMotion } from 'motion/react';
import * as React from 'react';

import Icon from './Icon';
import Surface from './layout/Surface';
import Heading from './typography/Heading';
import { paragraphVariants } from './typography/Paragraph';
import { cva, cx, type VariantProps } from './utils/cva';

const alertVariants = cva({
  base: 'inset-surface my-6 flex w-full items-start rounded first:mt-0 last:mb-0',
  variants: {
    variant: {
      default: '',
      // Override the --link primitive (not the --color-link @theme inline alias, which is
      // substituted away at compile time so consumers read var(--link) directly).
      info: 'text-info-contrast bg-info [--link:var(--info-contrast)]',
      destructive:
        'text-destructive-contrast bg-destructive [--link:var(--destructive-contrast)]',
      success:
        'text-success-contrast bg-success [--link:var(--success-contrast)]',
      warning:
        'text-warning-contrast bg-warning [--link:var(--warning-contrast)]',
    },
    density: {
      default: 'gap-4',
      compact: 'gap-3',
    },
  },
  defaultVariants: {
    variant: 'default',
    density: 'default',
  },
});

type Variant = NonNullable<VariantProps<typeof alertVariants>['variant']>;
type Density = NonNullable<VariantProps<typeof alertVariants>['density']>;
type AlertIcon =
  | LucideIcon
  | React.ComponentType<React.SVGProps<SVGSVGElement>>;
type AlertIconStyle = React.CSSProperties & {
  '--warning-icon-accent'?: string;
  '--warning-icon-accent-dark'?: string;
};

const InfoAlertIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <Icon {...props} name="info" />
);

const WarningAlertIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <Icon {...props} name="warning" />
);

const variantIcons: Record<Variant, AlertIcon | null> = {
  default: null,
  info: InfoAlertIcon,
  destructive: WarningAlertIcon,
  success: PartyPopper,
  warning: WarningAlertIcon,
};

const variantIconStyles: Record<Variant, AlertIconStyle | undefined> = {
  default: undefined,
  info: undefined,
  success: undefined,
  warning: {
    '--warning-icon-accent': 'var(--warning)',
    '--warning-icon-accent-dark':
      'color-mix(in oklab, var(--warning) 70%, black)',
  },
  destructive: {
    '--warning-icon-accent': 'var(--destructive)',
    '--warning-icon-accent-dark':
      'color-mix(in oklab, var(--destructive) 70%, black)',
  },
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

const alertIconVariants = cva({
  base: 'inline-flex shrink-0 origin-center items-center justify-center',
  variants: {
    density: {
      default: 'size-14',
      compact: 'size-7',
    },
  },
  defaultVariants: {
    density: 'default',
  },
});

const alertIconGraphicVariants = cva({
  variants: {
    density: {
      default: 'size-12',
      compact: 'size-6',
    },
  },
  defaultVariants: {
    density: 'default',
  },
});

type AlertProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants> & {
    icon?: AlertIcon | null | false;
  };

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  (
    { className, variant = 'default', density, icon, children, ...props },
    ref,
  ) => {
    const animation = useAnimation();
    const shouldReduceMotion = useReducedMotion();
    const IconComponent =
      icon === false ? null : (icon ?? variantIcons[variant]);
    const iconStyle = icon == null ? variantIconStyles[variant] : undefined;
    const resolvedDensity: Density = density ?? 'default';

    return (
      <Surface
        ref={ref}
        role={variantRoles[variant]}
        spacing={resolvedDensity === 'compact' ? 'xs' : 'sm'}
        shadow="sm"
        className={cx(alertVariants({ variant, density }), className)}
        noContainer
        maxWidth="3xl"
        {...props}
      >
        {IconComponent && (
          <motion.span
            aria-hidden="true"
            animate={animation}
            onViewportEnter={() => {
              if (shouldReduceMotion) return;
              void animation.start({
                rotate: [-12, 8, -6, 3, 0],
                scale: [1, 1.14, 1],
                transition: {
                  delay: 0.3,
                  duration: 0.82,
                  ease: [0.36, 0.07, 0.19, 0.97],
                },
              });
            }}
            className={alertIconVariants({ density: resolvedDensity })}
          >
            <IconComponent
              className={alertIconGraphicVariants({ density: resolvedDensity })}
              style={iconStyle}
            />
          </motion.span>
        )}
        <div className="min-w-0 flex-1">
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
  <div
    ref={ref}
    className={cx(paragraphVariants({ margin: 'none' }), className)}
    {...props}
  />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertDescription, AlertTitle };
