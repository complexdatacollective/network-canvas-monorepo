/**
 * Every contrast ratio the theme files record in a comment, with the pair of
 * colours it was measured on.
 *
 * The comments are prose, so a ratio cannot be matched to its pair
 * mechanically. This table does that by hand, once, and the test then holds
 * both ends of it: the `quote` must still be in the file (so editing the
 * number in the comment fails), every ratio mentioned in a theme file must be
 * claimed here (so a new comment cannot go unchecked), and the computed ratio
 * of the pair must match the recorded number (so editing a token fails).
 *
 * `fg` and `bg` are CSS colours evaluated in the named scope, so they can use
 * `var()` to read the live tokens, or write out a colour the comment describes
 * ("neat sea green", "the mixture at 78%") that is no longer in the file.
 */
import type { ScopeName } from './theme-colors.ts';

export type Backdrop =
  | string
  | {
      /** `tint` painted at `alpha` over `over`, as `bg-x/10` does. */
      tint: string;
      alpha: number;
      over: string;
    };

export type Measurement = { scope: ScopeName; fg: string; bg: Backdrop };

export type RecordedRatio = {
  file: 'default' | 'interview' | 'studio';
  /** Verbatim text from the comment (comment markers removed). */
  quote: string;
  /** The ratio the comment states, as the number before `:1`. */
  ratio: number;
  /** All of these must come out at `ratio`. */
  measurements: Measurement[];
};

const WHITE = 'oklch(var(--white))';

export const RECORDED_RATIOS: RecordedRatio[] = [
  // ---- studio.css ---------------------------------------------------------
  {
    file: 'studio',
    quote: 'white on neat sea green (2.28:1) in its light block',
    ratio: 2.28,
    measurements: [
      {
        scope: 'default-light',
        fg: 'var(--success-contrast)',
        bg: 'var(--success)',
      },
    ],
  },
  {
    file: 'studio',
    quote: '(4.41:1). `--selected` clears the ground',
    ratio: 4.41,
    measurements: [
      { scope: 'studio-light', fg: 'var(--background)', bg: 'var(--warning)' },
    ],
  },
  {
    file: 'studio',
    quote: '(1.11:1, indistinguishable)',
    ratio: 1.11,
    measurements: [
      {
        scope: 'studio-light',
        fg: 'oklch(from var(--primary) calc(l + 0.2) calc(c + 0.05) h)',
        bg: 'var(--accent)',
      },
    ],
  },
  {
    file: 'studio',
    quote: '~1.6:1 from each neighbour',
    ratio: 1.6,
    measurements: [
      { scope: 'studio-light', fg: 'var(--secondary)', bg: 'var(--accent)' },
      { scope: 'studio-light', fg: 'var(--secondary)', bg: 'var(--primary)' },
    ],
  },
  {
    file: 'studio',
    quote: 'bare `--accent` on the depth-0 chip is 4.33:1',
    ratio: 4.33,
    measurements: [
      {
        scope: 'studio-light',
        fg: 'var(--accent)',
        bg: 'var(--surface-accent)',
      },
    ],
  },
  {
    file: 'studio',
    quote: 'At `l - 0.04` it cleared AA by a hair (4.56:1)',
    ratio: 4.56,
    measurements: [
      {
        scope: 'studio-light',
        fg: 'oklch(from var(--accent) calc(l - 0.04) c h)',
        bg: 'var(--surface-accent-1)',
      },
    ],
  },
  {
    file: 'studio',
    quote: '5.65:1 at depth 0',
    ratio: 5.65,
    measurements: [
      {
        scope: 'studio-light',
        fg: 'var(--surface-accent-contrast)',
        bg: 'var(--surface-accent)',
      },
    ],
  },
  {
    file: 'studio',
    quote: '5.00:1 at 1-4. The dark block solves',
    ratio: 5.0,
    measurements: [1, 2, 3, 4].map((depth) => ({
      scope: 'studio-light' as const,
      fg: `var(--surface-accent-${depth}-contrast)`,
      bg: `var(--surface-accent-${depth})`,
    })),
  },
  {
    file: 'studio',
    quote: "78% measures 5.46:1 on this scope's pale `--surface-accent`",
    ratio: 5.46,
    measurements: [
      {
        scope: 'studio-light',
        fg: 'var(--destructive-strong)',
        bg: 'var(--surface-accent)',
      },
    ],
  },
  {
    file: 'studio',
    quote: 'and 4.83:1 on `--surface-accent-1`',
    ratio: 4.83,
    measurements: [
      {
        scope: 'studio-light',
        fg: 'var(--destructive-strong)',
        bg: 'var(--surface-accent-1)',
      },
    ],
  },
  {
    file: 'studio',
    quote: 'At its native L 0.7 the fill is 2.28:1 against white',
    ratio: 2.28,
    measurements: [
      { scope: 'studio-light', fg: WHITE, bg: 'oklch(var(--sea-green))' },
    ],
  },
  {
    file: 'studio',
    quote: 'was no better at 2.16:1',
    ratio: 2.16,
    measurements: [
      {
        scope: 'studio-light',
        fg: 'oklch(var(--sea-green))',
        bg: 'var(--background)',
      },
    ],
  },
  {
    file: 'studio',
    quote: '5.62:1 for white on the fill',
    ratio: 5.62,
    measurements: [
      {
        scope: 'studio-light',
        fg: 'var(--success-contrast)',
        bg: 'var(--success)',
      },
    ],
  },
  {
    file: 'studio',
    quote: '5.33:1 for `text-success` on the ground',
    ratio: 5.33,
    measurements: [
      { scope: 'studio-light', fg: 'var(--success)', bg: 'var(--background)' },
    ],
  },
  {
    file: 'studio',
    quote: '(4.77:1 on that tint)',
    ratio: 4.77,
    measurements: [
      {
        scope: 'studio-light',
        fg: 'var(--success)',
        bg: { tint: 'var(--success)', alpha: 0.1, over: 'var(--surface)' },
      },
    ],
  },
  {
    file: 'studio',
    quote: '(1.79:1 fill against the ground',
    ratio: 1.79,
    measurements: [
      { scope: 'studio-light', fg: 'var(--selected)', bg: 'var(--background)' },
    ],
  },
  {
    file: 'studio',
    quote: '1.86:1 against `--surface`',
    ratio: 1.86,
    measurements: [
      { scope: 'studio-light', fg: 'var(--selected)', bg: 'var(--surface)' },
    ],
  },
  {
    file: 'studio',
    quote: 'at 0.5 it was 3.29:1 on the fill',
    ratio: 3.29,
    measurements: [
      {
        scope: 'studio-light',
        fg: 'oklch(0.5 0.12 var(--mustard-hue))',
        bg: 'var(--selected)',
      },
    ],
  },
  {
    file: 'studio',
    quote: 'At 0.4 it is 4.98:1',
    ratio: 4.98,
    measurements: [
      {
        scope: 'studio-light',
        fg: 'var(--selected-contrast)',
        bg: 'var(--selected)',
      },
    ],
  },
  {
    file: 'studio',
    quote: '(`bg-selected/15`, 8.38:1)',
    ratio: 8.38,
    measurements: [
      {
        scope: 'studio-light',
        fg: 'var(--selected-contrast)',
        bg: { tint: 'var(--selected)', alpha: 0.15, over: 'var(--surface)' },
      },
    ],
  },
  {
    file: 'studio',
    quote: 'below `--background` (1.35:1)',
    ratio: 1.35,
    measurements: [
      { scope: 'studio-light', fg: 'var(--outline)', bg: 'var(--background)' },
    ],
  },
  {
    file: 'studio',
    quote: 'Bare `--accent` gives 4.84:1 at depth 0',
    ratio: 4.84,
    measurements: [
      {
        scope: 'studio-dark',
        fg: 'var(--accent)',
        bg: 'var(--surface-accent)',
      },
    ],
  },
  {
    file: 'studio',
    quote: 'but only 3.99:1 from depth 1 on',
    ratio: 3.99,
    measurements: [1, 2, 3, 4].map((depth) => ({
      scope: 'studio-dark' as const,
      fg: 'var(--accent)',
      bg: `var(--surface-accent-${depth})`,
    })),
  },
  {
    file: 'studio',
    quote: '6.25:1 at depth 0',
    ratio: 6.25,
    measurements: [
      {
        scope: 'studio-dark',
        fg: 'var(--surface-accent-contrast)',
        bg: 'var(--surface-accent)',
      },
    ],
  },
  {
    file: 'studio',
    quote: '5.15:1 at 1-4',
    ratio: 5.15,
    measurements: [1, 2, 3, 4].map((depth) => ({
      scope: 'studio-dark' as const,
      fg: `var(--surface-accent-${depth}-contrast)`,
      bg: `var(--surface-accent-${depth})`,
    })),
  },
  {
    file: 'studio',
    quote: 'white lands on 3.85:1',
    ratio: 3.85,
    measurements: [
      { scope: 'studio-dark', fg: WHITE, bg: 'var(--destructive)' },
    ],
  },
  {
    file: 'studio',
    quote: 'Dark ink takes the pairing to 5.06:1',
    ratio: 5.06,
    measurements: [
      {
        scope: 'studio-dark',
        fg: 'var(--destructive-contrast)',
        bg: 'var(--destructive)',
      },
    ],
  },
  {
    file: 'studio',
    quote: 'plain tomato would support white (4.94:1)',
    ratio: 4.94,
    measurements: [
      { scope: 'studio-dark', fg: WHITE, bg: 'oklch(var(--tomato))' },
    ],
  },
  {
    file: 'studio',
    quote: 'would fall from 4.35:1',
    ratio: 4.35,
    measurements: [
      { scope: 'studio-dark', fg: 'var(--destructive)', bg: 'var(--surface)' },
    ],
  },
  {
    file: 'studio',
    quote: 'to 3.39:1',
    ratio: 3.39,
    measurements: [
      {
        scope: 'studio-dark',
        fg: 'oklch(var(--tomato))',
        bg: 'var(--surface)',
      },
    ],
  },
  {
    file: 'studio',
    quote: 'leaves the ink on 4.32:1',
    ratio: 4.32,
    measurements: [
      {
        scope: 'studio-dark',
        fg: 'color-mix(in oklch, var(--destructive) 78%, var(--text))',
        bg: 'var(--surface-accent)',
      },
    ],
  },
  {
    file: 'studio',
    quote: '56% measures 5.66:1',
    ratio: 5.66,
    measurements: [
      {
        scope: 'studio-dark',
        fg: 'var(--destructive-strong)',
        bg: 'var(--surface-accent)',
      },
    ],
  },
  {
    file: 'studio',
    quote: 'and 4.66:1 and is still plainly red',
    ratio: 4.66,
    measurements: [
      {
        scope: 'studio-dark',
        fg: 'var(--destructive-strong)',
        bg: 'var(--surface-accent-1)',
      },
    ],
  },
  {
    file: 'studio',
    quote: 'white would land near 2.1:1',
    ratio: 2.1,
    measurements: [{ scope: 'studio-dark', fg: WHITE, bg: 'var(--success)' }],
  },
  {
    file: 'studio',
    quote: 'white on this fill is 3.18:1',
    ratio: 3.18,
    measurements: [{ scope: 'studio-dark', fg: WHITE, bg: 'var(--info)' }],
  },
  {
    file: 'studio',
    quote: 'Dark ink gives 6.12:1',
    ratio: 6.12,
    measurements: [
      { scope: 'studio-dark', fg: 'var(--info-contrast)', bg: 'var(--info)' },
    ],
  },
  {
    file: 'studio',
    quote: 'only reaches 4.43:1 against white',
    ratio: 4.43,
    measurements: [
      { scope: 'studio-dark', fg: WHITE, bg: 'oklch(var(--cerulean-blue))' },
    ],
  },

  // ---- default.css --------------------------------------------------------
  {
    file: 'default',
    quote: '78% measures 5.00:1 here',
    ratio: 5.0,
    measurements: [
      {
        scope: 'default-light',
        fg: 'var(--destructive-strong)',
        bg: 'var(--surface-accent)',
      },
    ],
  },
  {
    file: 'default',
    quote: 'and 4.55:1 on `--surface-accent-1`',
    ratio: 4.55,
    measurements: [
      {
        scope: 'default-light',
        fg: 'var(--destructive-strong)',
        bg: 'var(--surface-accent-1)',
      },
    ],
  },
  {
    file: 'default',
    quote: 'White on the lifted fill is 3.85:1',
    ratio: 3.85,
    measurements: [
      { scope: 'default-dark', fg: WHITE, bg: 'var(--destructive)' },
    ],
  },
  {
    file: 'default',
    quote: 'dark ink is 5.06:1',
    ratio: 5.06,
    measurements: [
      {
        scope: 'default-dark',
        fg: 'var(--destructive-box-contrast)',
        bg: 'var(--destructive)',
      },
    ],
  },
  {
    file: 'default',
    quote: "78% measures 4.63:1 on this scope's `--surface-accent`",
    ratio: 4.63,
    measurements: [
      {
        scope: 'default-dark',
        fg: 'color-mix(in oklch, var(--destructive) 78%, var(--text))',
        bg: 'var(--surface-accent)',
      },
    ],
  },
  {
    file: 'default',
    quote: 'but 4.17:1 on `--surface-accent-1`',
    ratio: 4.17,
    measurements: [
      {
        scope: 'default-dark',
        fg: 'color-mix(in oklch, var(--destructive) 78%, var(--text))',
        bg: 'var(--surface-accent-1)',
      },
    ],
  },
  {
    file: 'default',
    quote: '70% measures 5.13:1',
    ratio: 5.13,
    measurements: [
      {
        scope: 'default-dark',
        fg: 'var(--destructive-strong)',
        bg: 'var(--surface-accent)',
      },
    ],
  },
  {
    file: 'default',
    quote: 'and 4.62:1.',
    ratio: 4.62,
    measurements: [
      {
        scope: 'default-dark',
        fg: 'var(--destructive-strong)',
        bg: 'var(--surface-accent-1)',
      },
    ],
  },

  // ---- interview.css ------------------------------------------------------
  {
    file: 'interview',
    quote: 'neat coral (L 0.57) reads 1.71:1 on it',
    ratio: 1.71,
    measurements: [
      {
        scope: 'interview',
        fg: 'oklch(var(--neon-coral))',
        bg: 'var(--surface-3)',
      },
    ],
  },
  {
    file: 'interview',
    quote: 'only reaches 2.46:1',
    ratio: 2.46,
    measurements: [
      {
        scope: 'interview',
        fg: 'color-mix(in oklch, var(--destructive) 78%, var(--text))',
        bg: 'var(--surface-accent)',
      },
    ],
  },
  {
    file: 'interview',
    quote: '28% measures 5.41:1 on `--surface-accent`',
    ratio: 5.41,
    measurements: [
      {
        scope: 'interview',
        fg: 'var(--destructive-strong)',
        bg: 'var(--surface-accent)',
      },
    ],
  },
  {
    file: 'interview',
    quote: 'and 4.75:1 on `--surface-accent-1`',
    ratio: 4.75,
    measurements: [
      {
        scope: 'interview',
        fg: 'var(--destructive-strong)',
        bg: 'var(--surface-accent-1)',
      },
    ],
  },
];
