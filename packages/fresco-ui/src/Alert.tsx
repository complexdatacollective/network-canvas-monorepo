'use client';

import type { LucideIcon } from 'lucide-react';
import { motion, useAnimation, useReducedMotion } from 'motion/react';
import * as React from 'react';

import Icon from './Icon';
import Surface from './layout/Surface';
import Heading from './typography/Heading';
import { paragraphVariants } from './typography/Paragraph';
import { cva, cx, type VariantProps } from './utils/cva';

const alertVariants = cva({
  base: 'my-6 flex w-full rounded first:mt-0 last:mb-0',
  variants: {
    variant: {
      default: 'bg-surface text-contrast [--link:var(--color-link)]',
      info: 'text-info-contrast bg-info [--link:var(--info-contrast)]',
      destructive:
        'text-destructive-contrast bg-destructive [--link:var(--destructive-contrast)]',
      success:
        'text-success-contrast bg-success [--link:var(--success-contrast)]',
      warning:
        'text-warning-contrast bg-warning [--link:var(--warning-contrast)]',
      accent: 'text-accent-contrast bg-accent [--link:var(--accent-contrast)]',
    },
    appearance: {
      solid: 'inset-surface',
      soft: 'elevation-medium [--published-bg:inherit]',
    },
    density: {
      default: 'items-start gap-4',
      compact: 'items-center gap-3',
    },
  },
  defaultVariants: {
    variant: 'default',
    appearance: 'solid',
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

const SuccessAlertIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <Icon {...props} name="success" />
);

const WarningAlertIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <Icon {...props} name="warning" />
);

const variantIcons: Record<Variant, AlertIcon | null> = {
  default: null,
  info: InfoAlertIcon,
  destructive: WarningAlertIcon,
  success: SuccessAlertIcon,
  warning: WarningAlertIcon,
  // The accent (note/key-concept) variant shares the illustrated light-bulb
  // with `info`. Overridable via the `icon` prop.
  accent: InfoAlertIcon,
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
  accent: undefined,
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
  accent: 'status',
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
  accent: 'Note',
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
    {
      className,
      variant = 'default',
      appearance,
      density,
      icon,
      children,
      ...props
    },
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
        className={cx(
          alertVariants({ variant, appearance, density }),
          className,
        )}
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
