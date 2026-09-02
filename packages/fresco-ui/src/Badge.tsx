import type * as React from 'react';

import {
  type PaletteColor,
  paletteColorStyles,
  type ThemeColorStyle,
} from './styles/palette';
import { cva, cx, type VariantProps } from './utils/cva';

const BADGE_BASE_CLASSES =
  'inline-flex shrink items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold';

const badgeVariants = cva({
  base: BADGE_BASE_CLASSES,
  variants: {
    variant: {
      default: 'bg-primary text-primary-contrast border-transparent',
      secondary: 'bg-secondary text-secondary-contrast border-transparent',
      destructive:
        'bg-destructive text-destructive-contrast border-transparent',
      outline: 'text-current',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type BadgeColor = PaletteColor;

type BadgeStyle = React.CSSProperties & {
  '--badge-color'?: string;
  '--badge-contrast'?: string;
  '--badge-label'?: string;
};

type BadgeProps = object &
  Omit<React.HTMLAttributes<HTMLDivElement>, 'color'> &
  VariantProps<typeof badgeVariants> & {
    color?: BadgeColor;
  };

const themedBadgeVariants = cva({
  base: BADGE_BASE_CLASSES,
  variants: {
    variant: {
      filled: 'border-transparent bg-(--badge-color) text-(--badge-contrast)',
      outline:
        'border-(--badge-color) bg-[color-mix(in_oklab,var(--badge-color)_14%,transparent)] text-(--badge-label)',
    },
  },
});

function Badge({ className, color, variant, style, ...props }: BadgeProps) {
  const colorVariant = variant === 'outline' ? 'outline' : 'filled';
  const colorStyle: ThemeColorStyle | null = color
    ? paletteColorStyles[color]
    : null;
  const badgeStyle: BadgeStyle | undefined = colorStyle
    ? {
        ...style,
        '--badge-color': colorStyle.color,
        '--badge-contrast': colorStyle.contrast,
        '--badge-label': colorStyle.label ?? colorStyle.color,
      }
    : style;

  return (
    <div
      className={cx(
        color
          ? themedBadgeVariants({ variant: colorVariant })
          : badgeVariants({ variant }),
        className,
      )}
      style={badgeStyle}
      {...props}
    />
  );
}

export { Badge, type BadgeColor };
