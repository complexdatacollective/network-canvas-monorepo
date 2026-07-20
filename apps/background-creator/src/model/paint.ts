// Resolves a model colour value for direct rendering in the app's own themed
// DOM (overlay chrome, inline editors — anything outside the serialized SVG,
// which resolves sentinels via its embedded <style> instead). The `--color-*`
// names are Tailwind @theme-inline tokens that may not exist as runtime custom
// properties, so each carries the raw theme-scope variable as its fallback.
export function resolvePaint(color: string): string {
  if (color === 'text') return 'var(--color-text, var(--text))';
  if (color === 'background')
    return 'var(--color-background, var(--background))';
  return color;
}
