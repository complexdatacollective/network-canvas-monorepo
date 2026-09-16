import type * as React from 'react';

import { type PaletteColor, paletteColorStyles } from './styles/palette';
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

/** Every colour a badge can be, enumerable: a type cannot be iterated. */
const BADGE_COLORS = Object.keys(paletteColorStyles) as readonly BadgeColor[];

type BadgeStyle = React.CSSProperties & {
  '--badge-color'?: string;
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
      /**
       * `contrast-color()` reads the label in whichever of black or white
       * contrasts with the fill further, so no hand-written ink can disagree
       * with the colour it sits on. Winning that comparison is not itself WCAG
       * AA, so the `ThemeColors` story measures every colour: the worst is
       * neon coral at 4.62:1.
       */
      filled:
        'border-transparent bg-(--badge-color) text-[contrast-color(var(--badge-color))]',
      /**
       * The colour is the border and a wash of it behind the label; the label
       * itself is the contrast colour the surface underneath publishes.
       *
       * Not the theme colour: most of this palette sits in the middle of the
       * lightness range, where the colour reaches neither 4.5:1 against a 14%
       * wash of itself nor against white — cerulean blue is 4.43:1 either way.
       *
       * `--published-text` rather than `--text`, because the page's text token
       * is only guaranteed against the page: on Architect's accent series
       * `--text` measures 2.69:1 where the surface's own contrast colour is
       * 5.16:1. Off a published surface it is unset and the inherited colour
       * applies.
       *
       * The wash stays mixed toward `transparent` rather than toward
       * `--published-bg`, which is the surface's colour only while the badge
       * sits directly on it.
       */
      outline:
        'border-(--badge-color) bg-[color-mix(in_oklab,var(--badge-color)_14%,transparent)] text-(--published-text)',
    },
  },
});

function Badge({ className, color, variant, style, ...props }: BadgeProps) {
  const colorVariant = variant === 'outline' ? 'outline' : 'filled';
  const badgeStyle: BadgeStyle | undefined = color
    ? { ...style, '--badge-color': paletteColorStyles[color].color }
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

export { Badge, BADGE_COLORS, type BadgeColor };
