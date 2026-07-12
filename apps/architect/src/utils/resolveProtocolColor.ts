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
 */
export function resolveProtocolColor(
  name: string,
  opts?: { dark?: boolean },
): string {
  const prefix = SEQ_PREFIXES.find((p) => name.startsWith(p));
  if (prefix) {
    const themeVar = `--${prefix.replace('-color-seq-', '-')}${name.slice(prefix.length)}`;
    return opts?.dark
      ? `oklch(from var(${themeVar}) calc(l - 0.05) c h)`
      : `var(${themeVar})`;
  }
  return opts?.dark ? `oklch(var(--${name}--dark))` : `oklch(var(--${name}))`;
}
