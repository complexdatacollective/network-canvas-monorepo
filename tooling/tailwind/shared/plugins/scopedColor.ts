// The elevation and inset-surface plugins copy the value of every `bg-*` /
// `text-*` class into a custom property (--scoped-bg, --scoped-text,
// --inset-bg) that other utilities read as a colour. Tailwind also gives both
// roots non-colour arbitrary values: `text-[12px]` is a font size,
// `bg-[length:200%_100%]` a background size, `bg-[url(/hero.png)]` an image.
// Copying those hands a length or an image to code that expects a colour.
//
// Tailwind's `type: 'color'` option can't do this filtering. It rejects every
// unhinted `var()` value, which would drop real colours such as
// `bg-(--edge-color)`, and it mixes the alpha modifier into the value, which
// these plugins deliberately discard. So the plugins keep the default type and
// skip only values that are clearly not colours. A `var()` value is always
// copied, because the callback can't see a type hint: write a background size
// held in a variable as `bg-size-[var(--size)]`, not `bg-[length:var(--size)]`.
const NOT_A_COLOR = [
  // Numbers, lengths, percentages and size pairs: `12px`, `0`, `200% 100%`.
  /^[-+]?\.?\d/,
  // Math functions resolve to numbers or lengths.
  /^(?:calc|min|max|clamp|round|mod|rem|abs|sign)\(/,
  // Images.
  /^(?:repeating-)?(?:linear|radial|conic)-gradient\(/,
  /^(?:url|image|image-set|cross-fade|element)\(/,
  // Size, position and font-size keywords.
  /^(?:auto|cover|contain|none|top|bottom|left|right|center|smaller|larger|(?:xx?x?-)?(?:small|large)|medium)(?:\s|$)/,
];

// Rewrite `var(--color-X)` references to `var(--X)` so --scoped-bg /
// --scoped-text / --inset-bg point at the bare semantic tokens declared by the
// theme files (`--background`, `--text`, etc.) rather than going through
// Tailwind's `--color-*` indirection. Tailwind's `api.theme(...)` resolves
// color tokens to their `--color-*` form regardless of `@theme inline`, so we
// strip the prefix at plugin emit time. Literal values (oklch(...),
// currentColor) are unchanged because they don't match the pattern.
const stripColorPrefix = (value: string) =>
  value.replace(/var\(--color-/g, 'var(--');

/**
 * The value to copy into a scoped colour property, or `null` when the class's
 * value is not a colour and nothing should be copied.
 */
export function scopedColor(value: string): string | null {
  if (NOT_A_COLOR.some((pattern) => pattern.test(value.trim()))) return null;
  return stripColorPrefix(value);
}
