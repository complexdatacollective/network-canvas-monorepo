const SEQ_PREFIXES = [
  'node-color-seq-',
  'edge-color-seq-',
  'ord-color-seq-',
  'cat-color-seq-',
] as const;

/**
 * The colour an out-of-range sequence index falls back to. A protocol can hold
 * a sequence index past the end of its palette (some pickers used to offer ten
 * swatches of an eight-colour palette, and an imported protocol carries
 * whatever it was authored with), and the theme defines no variable for it.
 *
 * This is a DEFAULT rather than an opt-in on purpose. Without a fallback such a
 * value renders as nothing at all — an invisible chip, edge or icon the
 * researcher cannot see in order to replace it — and an opt-in guard that every
 * new call site has to remember will be forgotten: it already was, at five of
 * the six call sites that existed when `fallback` was first added.
 */
const OUT_OF_RANGE_FALLBACK = 'var(--input-contrast)';

/**
 * Resolve a protocol color name to a CSS color expression built on variables
 * that exist at runtime under the shared fresco theme. Codebook sequence
 * names ('node-color-seq-3') map onto the theme's
 * --node-N/--edge-N/--ord-N/--cat-N variables, which re-resolve inside themed
 * regions; the theme ships no dark sequence variants, so `dark` derives one
 * via relative color syntax (mirroring the palette's 0.05 lightness step).
 * Named palette hues resolve from the raw oklch triplets, which require the
 * color-function wrapper.
 *
 * Every sequence name resolves through a CSS custom-property fallback, so a
 * name the theme has no variable for still paints something visible. There is
 * no way to switch that off: `var(--node-3, …)` is inert whenever `--node-3`
 * exists, so the fallback costs an in-range colour nothing. `fallback`
 * overrides which colour is used when a caller has a better one for its
 * surface.
 */
export function resolveProtocolColor(
  name: string,
  opts?: { dark?: boolean; fallback?: string },
): string {
  const prefix = SEQ_PREFIXES.find((p) => name.startsWith(p));
  if (prefix) {
    const themeVar = `--${prefix.replace('-color-seq-', '-')}${name.slice(prefix.length)}`;
    const reference = `var(${themeVar}, ${opts?.fallback ?? OUT_OF_RANGE_FALLBACK})`;
    return opts?.dark
      ? `oklch(from ${reference} calc(l - 0.05) c h)`
      : reference;
  }
  return opts?.dark ? `oklch(var(--${name}--dark))` : `oklch(var(--${name}))`;
}
