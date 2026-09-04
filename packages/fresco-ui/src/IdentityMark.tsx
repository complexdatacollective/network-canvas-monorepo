import { cva, cx, type VariantProps } from './utils/cva';

/**
 * The Network Canvas hues an id can land on, each paired with the foreground
 * that reads against it.
 *
 * The pairings are measured, not guessed. Against white and against
 * `--color-charcoal`, the WCAG contrast ratios of the six fills are:
 *
 * | fill            | on white | on charcoal |
 * | --------------- | -------- | ----------- |
 * | neon coral      |     4.63 |        2.93 |
 * | mustard         |     1.82 |        7.43 |
 * | sea green       |     2.27 |        5.96 |
 * | sea serpent     |     2.23 |        6.07 |
 * | purple pizazz   |     4.18 |        3.24 |
 * | cyber grape     |    13.96 |        1.03 |
 *
 * So the three light fills — mustard, sea green AND sea serpent — take the
 * dark foreground. Sea serpent is the one that surprises: it sits at almost
 * exactly sea green's lightness (OKLCH L 0.738 against 0.700), so white on it
 * is 2.23:1, which fails even the 3:1 floor for large text. `Badge`'s colour
 * table already pairs sea serpent with charcoal for the same reason.
 *
 * Token-backed utilities rather than literals: these resolve through
 * `--color-*` in the Fresco theme, so a themed region repaints the mark with
 * everything else.
 */
const IDENTITY_MARK_TONES = [
  'bg-neon-coral text-white',
  'bg-mustard text-charcoal',
  'bg-sea-green text-charcoal',
  'bg-sea-serpent text-charcoal',
  'bg-purple-pizazz text-white',
  'bg-cyber-grape text-white',
] as const;

/**
 * Shown when a name yields no letters or digits at all — an entity called
 * "•••" or "🙂". A mark with nothing in it would read as a rendering fault,
 * and throwing would take out a header over a name nobody validated.
 */
const IDENTITY_MARK_FALLBACK = '?';

const identityMarkVariants = cva({
  base: cx(
    'font-heading inline-flex shrink-0 items-center justify-center',
    'rounded-xs leading-none font-bold tracking-wide uppercase select-none',
  ),
  variants: {
    size: {
      sm: 'size-6 text-xs',
      md: 'size-8 text-sm',
      lg: 'size-10 text-base',
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
 * A deterministic 32-bit FNV-1a hash of the entity id.
 *
 * Determinism is the whole point of the component: the same id has to give
 * the same hue in every session, on every machine, with nothing persisted
 * anywhere. Anything that varied — a counter, the entity's position in a
 * list, a random seed — would recolour an entity between two renders of the
 * same screen, which is exactly what a stable visual identity cannot do.
 *
 * `Math.imul` rather than `*`: the FNV prime overflows the range where a
 * double multiplies integers exactly, and the wrap has to be the specified
 * 32-bit one for the hash to stay stable.
 */
function hashEntityId(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

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
/** At most two characters, counted as a reader sees them. */
function bound(letters: string): string {
  return Array.from(letters).slice(0, 2).join('');
}

function monogram(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter((word) => word !== '');
  const first = words.at(0);
  if (first === undefined) return IDENTITY_MARK_FALLBACK;

  // Bounded AFTER uppercasing, not before. Some characters get longer in the
  // process — German ß becomes SS, the ﬃ ligature becomes FFI — so slicing
  // first lets a two-character monogram come out as three or four and spill
  // out of a tile that has no room for them.
  const characters = Array.from(first);
  if (words.length === 1) {
    return bound(characters.slice(0, 2).join('').toUpperCase());
  }

  const last = Array.from(words.at(-1) ?? '');
  return bound(`${characters.at(0) ?? ''}${last.at(0) ?? ''}`.toUpperCase());
}

export type IdentityMarkProps = {
  /**
   * The entity id. The hue derives from this and only this, so renaming an
   * entity changes its monogram and never its colour.
   */
  id: string;
  /** The entity name. The monogram derives from it. */
  name: string;
  size?: IdentityMarkSize;
  className?: string;
};

/**
 * A small tile giving an entity a stable visual identity: a monogram on one
 * of six Network Canvas hues, chosen by hashing the entity's id.
 *
 * **Purely decorative, and it must stay that way.** The mark is `aria-hidden`
 * and is never the entity's accessible name — a two-letter monogram on a
 * colour identifies nothing to a reader who cannot see it, and a colour that
 * carries meaning on its own fails WCAG 1.4.1. Every caller renders the
 * entity's real name beside it; `EntitySwitcher` does. Do not later give this
 * an `aria-label`, a `title`, or a `role="img"` to "make it accessible" —
 * that would put the monogram into the accessible name twice over, ahead of
 * the name it abbreviates.
 *
 * The colour is derived, never stored: the same id gives the same hue
 * everywhere, with no assignment table to keep in sync and nothing to migrate.
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
  const tone =
    IDENTITY_MARK_TONES[hashEntityId(id) % IDENTITY_MARK_TONES.length] ??
    IDENTITY_MARK_TONES[0];

  return (
    <span
      aria-hidden
      className={cx(identityMarkVariants({ size }), tone, className)}
    >
      {monogram(name)}
    </span>
  );
}
