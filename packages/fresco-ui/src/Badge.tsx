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
 * token that paints it. The colour is the whole of the entry: the ink the
 * label is read in is computed from it (see `themedBadgeVariants`) rather than
 * assigned here, because a hand-assigned ink is a judgement that goes stale
 * the moment a palette entry's lightness moves — and seven of these thirty-six
 * were already wrong by WCAG AA when they were read as a badge's fill.
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

/**
 * The palette, enumerable. A story or a test that wants to say something about
 * every colour a badge can be — that its label is readable, say — has to be
 * able to reach the whole list, and a type cannot be iterated.
 */
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
       * The colour is the whole badge, and the label is read in whichever of
       * black or white contrasts with it further — chosen by the browser from
       * the colour itself, so the palette carries no second, hand-written ink
       * that can disagree with the fill it is supposed to sit on.
       *
       * Relative colour syntax does the choosing. `clamp(0, (l - 0.58) *
       * -1000, 1)` reads the fill's OKLCH lightness and collapses to a
       * lightness of 1 below the threshold and 0 above it, which at zero
       * chroma is white or black; the multiplier is only large enough to make
       * the ramp between them narrower than any two palette entries.
       *
       * 0.58 is where black overtakes white across this palette, measured by
       * compositing each colour and its two candidate inks: purple pizazz dark
       * (L 0.575) is the lightest colour that still needs white, and cerulean
       * blue (L 0.582) the darkest that needs black. Every one of the
       * thirty-six then clears WCAG AA for normal text, the worst being neon
       * coral at 4.62:1 — a margin the `ThemeColors` story measures rather
       * than assumes, because the window between those two colours is narrow
       * enough that a change to either one's lightness could close it.
       *
       * Unlike the outline variant below, the badge here is opaque, so what is
       * underneath it does not enter the calculation.
       */
      filled:
        'border-transparent bg-(--badge-color) text-[oklch(from_var(--badge-color)_clamp(0,(l-0.58)*-1000,1)_0_0)]',
      /**
       * The colour is the border and a wash of it behind the label; the label
       * itself is the contrast colour the surface underneath publishes.
       *
       * Not the theme colour: most of this palette sits in the middle of the
       * lightness range, where the colour reaches neither 4.5:1 against a 14%
       * wash of itself nor against white — cerulean blue is 4.43:1 either way.
       *
       * `--published-text` rather than `--text`, because the page's text token
       * is only guaranteed against the page. A `Surface` publishes the
       * background it paints and the contrast colour that goes with it
       * together, and a badge sitting on one is read against that background,
       * not against the page's. Where the two differ the page token is simply
       * the wrong ink: on Architect's accent series — the ladder every
       * `ArrayField` row is drawn on — `--text` is cyber grape on slate blue,
       * which measures 2.69:1, while the surface's own contrast colour is
       * white at 5.16:1. Off a published surface the variable is unset and the
       * declaration falls back to the inherited colour, which is what the
       * uncoloured `outline` variant above uses.
       *
       * The wash stays mixed toward `transparent` rather than toward
       * `--published-bg`: an opaque mix would repaint 86% of the badge in the
       * published background, which is the surface's colour only while the
       * badge sits directly on it. Alpha compositing is right wherever it sits.
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
