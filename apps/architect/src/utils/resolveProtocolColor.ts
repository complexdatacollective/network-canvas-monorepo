const SEQ_PREFIXES = [
  'node-color-seq-',
  'edge-color-seq-',
  'ord-color-seq-',
] as const;

/**
 * Resolve a protocol color name to a CSS color expression built on variables
 * that exist at runtime under the shared fresco theme. Codebook sequence
 * names ('node-color-seq-3') map onto the theme's --node-N/--edge-N/--ord-N
 * variables, which re-resolve inside themed regions; the theme ships no dark
 * sequence variants, so `dark` derives one via relative color syntax
 * (mirroring the palette's 0.05 lightness step). Named palette hues resolve
 * from the raw oklch triplets, which require the color-function wrapper.
 *
 * `fallback` is a CSS colour used when the theme defines no such sequence
 * variable. A protocol can hold a sequence index past the end of its palette
 * (some pickers used to offer ten swatches of an eight-colour palette), and
 * without a fallback that value renders as nothing at all — an invisible chip
 * the researcher cannot see to replace.
 */
export function resolveProtocolColor(
  name: string,
  opts?: { dark?: boolean; fallback?: string },
): string {
  const prefix = SEQ_PREFIXES.find((p) => name.startsWith(p));
  if (prefix) {
    const themeVar = `--${prefix.replace('-color-seq-', '-')}${name.slice(prefix.length)}`;
    const reference = opts?.fallback
      ? `var(${themeVar}, ${opts.fallback})`
      : `var(${themeVar})`;
    return opts?.dark
      ? `oklch(from ${reference} calc(l - 0.05) c h)`
      : reference;
  }
  return opts?.dark ? `oklch(var(--${name}--dark))` : `oklch(var(--${name}))`;
}
