import type * as React from 'react';

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

/**
 * The palette a coloured badge may be drawn in, each name mapped to the theme
 * token that paints it. The ink the label is read in is computed from the fill
 * (see `themedBadgeVariants`), never written down beside it.
 */
const themeColorStyles = {
  'white': 'var(--color-white)',
  'black': 'var(--color-black)',
  'neon-coral': 'var(--color-neon-coral)',
  'neon-coral-dark': 'var(--color-neon-coral-dark)',
  'sea-green': 'var(--color-sea-green)',
  'sea-green-dark': 'var(--color-sea-green-dark)',
  'slate-blue': 'var(--color-slate-blue)',
  'slate-blue-dark': 'var(--color-slate-blue-dark)',
  'navy-taupe': 'var(--color-navy-taupe)',
  'navy-taupe-dark': 'var(--color-navy-taupe-dark)',
  'cyber-grape': 'var(--color-cyber-grape)',
  'cyber-grape-dark': 'var(--color-cyber-grape-dark)',
  'mustard': 'var(--color-mustard)',
  'mustard-dark': 'var(--color-mustard-dark)',
  'rich-black': 'var(--color-rich-black)',
  'rich-black-dark': 'var(--color-rich-black-dark)',
  'charcoal': 'var(--color-charcoal)',
  'charcoal-dark': 'var(--color-charcoal-dark)',
  'platinum': 'var(--color-platinum)',
  'platinum-dark': 'var(--color-platinum-dark)',
  'sea-serpent': 'var(--color-sea-serpent)',
  'sea-serpent-dark': 'var(--color-sea-serpent-dark)',
  'purple-pizazz': 'var(--color-purple-pizazz)',
  'purple-pizazz-dark': 'var(--color-purple-pizazz-dark)',
  'paradise-pink': 'var(--color-paradise-pink)',
  'paradise-pink-dark': 'var(--color-paradise-pink-dark)',
  'cerulean-blue': 'var(--color-cerulean-blue)',
  'cerulean-blue-dark': 'var(--color-cerulean-blue-dark)',
  'kiwi': 'var(--color-kiwi)',
  'kiwi-dark': 'var(--color-kiwi-dark)',
  'neon-carrot': 'var(--color-neon-carrot)',
  'neon-carrot-dark': 'var(--color-neon-carrot-dark)',
  'barbie-pink': 'var(--color-barbie-pink)',
  'barbie-pink-dark': 'var(--color-barbie-pink-dark)',
  'tomato': 'var(--color-tomato)',
  'tomato-dark': 'var(--color-tomato-dark)',
} satisfies Record<string, string>;

type BadgeColor = keyof typeof themeColorStyles;

/** Every colour a badge can be, enumerable: a type cannot be iterated. */
const BADGE_COLORS = Object.keys(themeColorStyles) as readonly BadgeColor[];

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
    ? { ...style, '--badge-color': themeColorStyles[color] }
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
