/**
 * Fraction of a dimmed element's own colour retained when blending toward the
 * dim-blend target. The remainder is filled by that target colour, so a dimmed
 * piece stays fully opaque (no compositing artifacts from overlapping
 * semi-transparent elements) while reading as recessive. Tweak this single
 * constant to make dimming stronger or weaker.
 */
const DIMMED_BLEND = '30%';

/**
 * Blends a colour toward the surface a dimmed element should recede into,
 * producing a fully-opaque "dimmed" variant. The target is `--dim-blend`, which
 * defaults to the interview background (`var(--background)` only resolves to the
 * navy-taupe interview colour inside a `data-theme-interview` region). The
 * printable snapshot document overrides `--dim-blend` to white so dimmed nodes
 * and edges recede into the white paper rather than blending toward the dark
 * on-screen theme.
 */
export function dimColor(color: string): string {
  return `color-mix(in oklab, ${color} ${DIMMED_BLEND}, var(--dim-blend, var(--background)))`;
}
