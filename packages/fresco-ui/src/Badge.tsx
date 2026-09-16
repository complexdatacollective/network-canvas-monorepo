import { type useRender as UseRender, useRender } from '@base-ui/react';
import * as React from 'react';

import { type PaletteColor, paletteColorStyles } from './styles/palette';
import { cva, type VariantProps } from './utils/cva';

const badgeVariants = cva({
  base: 'inline-flex shrink-0 items-center rounded-full border font-semibold whitespace-nowrap',
  variants: {
    size: {
      sm: 'text-2xs gap-1 px-2 py-0.5 leading-tight',
      md: 'gap-1.5 px-2.5 py-0.5 text-xs leading-tight',
      lg: 'gap-2 px-3 py-1 text-sm leading-tight',
    },
    tone: {
      neutral:
        '[--badge-color:var(--neutral)] [--badge-contrast:var(--neutral-contrast)]',
      primary:
        '[--badge-color:var(--primary)] [--badge-contrast:var(--primary-contrast)]',
      secondary:
        '[--badge-color:var(--secondary)] [--badge-contrast:var(--secondary-contrast)]',
      accent:
        '[--badge-color:var(--accent)] [--badge-contrast:var(--accent-contrast)]',
      info: '[--badge-color:var(--info)] [--badge-contrast:var(--info-contrast)]',
      success:
        '[--badge-color:var(--success)] [--badge-contrast:var(--success-contrast)]',
      warning:
        '[--badge-color:var(--warning)] [--badge-contrast:var(--warning-contrast)]',
      destructive:
        '[--badge-color:var(--destructive)] [--badge-contrast:var(--destructive-contrast)]',
    },
    appearance: {
      filled: 'border-transparent bg-(--badge-color) text-(--badge-contrast)',
      soft: 'border-(--badge-color) bg-[color-mix(in_oklab,var(--badge-color)_14%,transparent)] text-(--published-text)',
    },
    mono: {
      true: 'font-monospace',
      false: '',
    },
    uppercase: {
      true: 'uppercase',
      false: '',
    },
  },
  compoundVariants: [
    { uppercase: true, size: 'sm', className: 'tracking-wide' },
    { uppercase: true, size: ['md', 'lg'], className: 'tracking-widest' },
  ],
  defaultVariants: {
    size: 'md',
    tone: 'neutral',
    appearance: 'filled',
    mono: false,
    uppercase: false,
  },
});

type BadgeVariantProps = VariantProps<typeof badgeVariants>;

type BadgeTone = NonNullable<BadgeVariantProps['tone']>;
type BadgeAppearance = NonNullable<BadgeVariantProps['appearance']>;
type BadgeSize = NonNullable<BadgeVariantProps['size']>;
type BadgeColor = PaletteColor;

const BADGE_COLORS = Object.keys(paletteColorStyles) as readonly BadgeColor[];

type BadgeStyle = React.CSSProperties & {
  '--badge-color'?: string;
  '--badge-contrast'?: string;
};

type BadgeProps = Omit<React.HTMLAttributes<HTMLElement>, 'color'> & {
  tone?: BadgeTone;
  appearance?: BadgeAppearance;
  size?: BadgeSize;
  mono?: boolean;
  uppercase?: boolean;
  icon?: React.ReactNode;
  color?: BadgeColor;
  render?: UseRender.RenderProp;
};

const Badge = React.forwardRef<HTMLElement, BadgeProps>(function Badge(
  {
    tone,
    appearance,
    size,
    mono,
    uppercase,
    icon,
    color,
    render,
    className,
    style,
    children,
    ...props
  },
  ref,
) {
  const badgeStyle: BadgeStyle | undefined = color
    ? {
        ...style,
        '--badge-color': paletteColorStyles[color].color,
        '--badge-contrast': 'contrast-color(var(--badge-color))',
      }
    : style;

  return useRender({
    render,
    ref,
    props: {
      className: badgeVariants({
        tone,
        appearance,
        size,
        mono,
        uppercase,
        className,
      }),
      style: badgeStyle,
      children: (
        <>
          {icon}
          {children}
        </>
      ),
      ...props,
    },
    defaultTagName: 'span',
  });
});

export {
  Badge,
  BADGE_COLORS,
  type BadgeAppearance,
  type BadgeColor,
  type BadgeProps,
  type BadgeSize,
  type BadgeTone,
};
