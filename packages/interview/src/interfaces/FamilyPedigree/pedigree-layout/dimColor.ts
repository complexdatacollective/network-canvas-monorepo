/**
 * Fraction of a dimmed element's own colour retained when blending toward the
 * interview background. The remainder is filled by `var(--background)`, so a
 * dimmed piece stays fully opaque (no compositing artifacts from overlapping
 * semi-transparent elements) while reading as recessive. Tweak this single
 * constant to make dimming stronger or weaker.
 */
const DIMMED_BLEND = '30%';

/**
 * Blends a colour toward the interview background by DIMMED_BLEND, producing a
 * fully-opaque "dimmed" variant. `var(--background)` only resolves to the
 * navy-taupe interview colour inside a `data-theme-interview` region.
 */
export function dimColor(color: string): string {
  return `color-mix(in oklab, ${color} ${DIMMED_BLEND}, var(--background))`;
}
