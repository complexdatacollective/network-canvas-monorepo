import { Pattern } from '@codaco/art';

import { cva, cx, type VariantProps } from './utils/cva';

/**
 * The coordinate space the pattern is generated in, whatever size the mark is
 * displayed at.
 *
 * `Pattern`'s variants size their motifs in this space — `dots` lays out a
 * 10–32 unit grid, and the others are comparable — so generating at the
 * mark's own 24–40px would put two or three cells across the tile and read as
 * three stray dots rather than as a pattern. Generating into a larger square
 * and letting the SVG scale down keeps a whole composition inside the tile.
 *
 * Square because the mark is: `PatternSvg` sets
 * `preserveAspectRatio="xMidYMid slice"`, so a non-square space would crop to
 * the tile and throw away part of what makes each seed distinguishable.
 */
const PATTERN_SPACE = 96;

/**
 * Shown when a name yields no letters or digits at all — an entity called
 * "•••" or "🙂". A mark with nothing in it would read as a rendering fault,
 * and throwing would take out a header over a name nobody validated.
 */
const IDENTITY_MARK_FALLBACK = '?';

const identityMarkVariants = cva({
  base: cx(
    'relative isolate inline-flex shrink-0 items-center justify-center',
    'overflow-hidden rounded-xs select-none',
  ),
  variants: {
    size: {
      sm: 'size-6',
      md: 'size-8',
      lg: 'size-10',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

const monogramVariants = cva({
  base: cx(
    'font-heading leading-none font-bold tracking-wide text-white uppercase',
    // The pattern is a gradient, and its lighter bases (mustard tops out at
    // OKLCH L 0.81) put white letters at around 2.3:1 where the gradient is
    // palest. The mark is decorative, so this is legibility rather than a
    // WCAG obligation — but a monogram that dissolves into its own background
    // looks like a bug. A soft shadow in the theme's own black holds the
    // letterforms over every base without a scrim flattening the art.
    '[text-shadow:0_1px_2px_oklch(var(--black)/0.55)]',
  ),
  variants: {
    size: {
      sm: 'text-[0.5625rem]',
      md: 'text-xs',
      lg: 'text-sm',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export type IdentityMarkSize = NonNullable<
  VariantProps<typeof identityMarkVariants>['size']
>;

/**
 * The one or two characters that stand for `name`.
 *
 * Words are whatever survives between runs of non-alphanumerics, so
 * punctuation, emoji and stray whitespace fall out rather than becoming a
 * monogram of their own: "Bo & Co." is "BC", and " the  SONIC   lab " is
 * "TL". Digits count as usable, so "2024 Cohort" is "2C".
 *
 * Split with `Array.from` rather than by code unit so a name outside the BMP
 * takes whole characters, and uppercased with `toUpperCase` rather than
 * `toLocaleUpperCase`, which would make the mark depend on the reader's
 * locale and stop being deterministic.
 */
function monogram(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter((word) => word !== '');
  const first = words.at(0);
  if (first === undefined) return IDENTITY_MARK_FALLBACK;

  const characters = Array.from(first);
  if (words.length === 1) {
    return characters.slice(0, 2).join('').toUpperCase();
  }

  const last = Array.from(words.at(-1) ?? '');
  return `${characters.at(0) ?? ''}${last.at(0) ?? ''}`.toUpperCase();
}

export type IdentityMarkProps = {
  /**
   * The entity id, and the pattern's seed. The artwork derives from this and
   * only this, so renaming an entity changes its monogram and never its
   * pattern.
   */
  id: string;
  /** The entity name. The monogram derives from it. */
  name: string;
  size?: IdentityMarkSize;
  className?: string;
};

/**
 * A small tile giving an entity a stable visual identity: a monogram over a
 * generated pattern, both derived from the entity itself.
 *
 * The pattern is `@codaco/art`'s `Pattern`, seeded with the entity id. That
 * package already owns this problem — a seeded RNG picking one of seven
 * variants and a base from the Network Canvas palette — so the mark inherits
 * both the artwork and its determinism rather than growing a second, poorer
 * version of them. Two teams are told apart by a texture as well as a hue,
 * which matters most where the identity is smallest and the names are alike:
 * "Wave 2 — pilot" beside "Wave 2 — main fieldwork".
 *
 * Derived, never stored: the same id gives the same artwork in every session
 * and on every machine, with no assignment table to keep in sync and nothing
 * to migrate. An entity with no id yet renders `Pattern`'s own empty-seed
 * surface rather than a broken tile.
 *
 * **Purely decorative, and it must stay that way.** The mark is `aria-hidden`
 * and is never the entity's accessible name — a monogram on a texture
 * identifies nothing to a reader who cannot see it, and artwork that carries
 * meaning on its own fails WCAG 1.4.1. Every caller renders the entity's real
 * name beside it; `EntitySwitcher` does. Do not later give this an
 * `aria-label`, a `title`, or a `role="img"` to "make it accessible" — that
 * would put the monogram into the accessible name ahead of the name it
 * abbreviates.
 *
 * ```tsx
 * <span className="flex items-center gap-2">
 *   <IdentityMark id={team.id} name={team.name} size="sm" />
 *   <span>{team.name}</span>
 * </span>
 * ```
 */
export function IdentityMark({
  id,
  name,
  size = 'md',
  className,
}: IdentityMarkProps) {
  return (
    <span aria-hidden className={cx(identityMarkVariants({ size }), className)}>
      <Pattern
        seed={id}
        width={PATTERN_SPACE}
        height={PATTERN_SPACE}
        className="absolute inset-0 -z-10 size-full"
      />
      <span className={monogramVariants({ size })}>{monogram(name)}</span>
    </span>
  );
}
