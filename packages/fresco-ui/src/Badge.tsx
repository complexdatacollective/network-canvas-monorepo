import { type useRender as UseRender, useRender } from '@base-ui/react';
import * as React from 'react';

import { type PaletteColor, paletteColorStyles } from './styles/palette';
import { cva, type VariantProps } from './utils/cva';

const badgeVariants = cva({
  base: 'inline-flex shrink items-center rounded-full border font-semibold',
  variants: {
    size: {
      sm: 'text-2xs gap-1 px-2 py-0.5',
      md: 'gap-1.5 px-2.5 py-0.5 text-xs',
      lg: 'gap-2 px-3 py-1.5 text-sm',
    },
    tone: {
      neutral: '[--badge-color:var(--neutral)]',
      primary: '[--badge-color:var(--primary)]',
      secondary: '[--badge-color:var(--secondary)]',
      accent: '[--badge-color:var(--accent)]',
      info: '[--badge-color:var(--info)]',
      success: '[--badge-color:var(--success)]',
      warning: '[--badge-color:var(--warning)]',
      destructive: '[--badge-color:var(--destructive)]',
    },
    appearance: {
      filled:
        'border-transparent bg-(--badge-color) text-(--badge-contrast,contrast-color(var(--badge-color)))',
      outline: '',
    },
    colored: {
      true: '',
      false: '',
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
    { appearance: 'outline', colored: false, className: 'text-current' },
    {
      appearance: 'outline',
      colored: true,
      className:
        'border-(--badge-color) bg-[color-mix(in_oklab,var(--badge-color)_14%,transparent)] text-(--published-text)',
    },
    { uppercase: true, size: 'sm', className: 'tracking-wide' },
    { uppercase: true, size: ['md', 'lg'], className: 'tracking-widest' },
  ],
  defaultVariants: {
    size: 'md',
    tone: 'primary',
    appearance: 'filled',
    colored: false,
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
    ? { ...style, '--badge-color': paletteColorStyles[color].color }
    : style;

  return useRender({
    render,
    ref,
    props: {
      className: badgeVariants({
        tone,
        appearance,
        colored: color !== undefined || tone !== undefined,
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
    defaultTagName: 'div',
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
