import type { ColorReference } from '@codaco/protocol-validation';

const SEQUENCE_PREFIXES = [
  'node-color-seq-',
  'edge-color-seq-',
  'ord-color-seq-',
  'cat-color-seq-',
] as const;

/**
 * A protocol colour name as a CSS colour expression.
 *
 * Codebook sequence names (`edge-color-seq-3`) map onto the shared theme's
 * `--node-N`/`--edge-N`/`--ord-N`/`--cat-N` variables, which re-resolve inside
 * a themed region. The theme ships no dark sequence variants, so `dark`
 * derives one through relative colour syntax, mirroring the palette's own 0.05
 * lightness step.
 *
 * Returns `undefined` for a name outside the sequences rather than throwing:
 * this renders decoration, and a protocol that has drifted ahead of the theme
 * should lose a tint, not the rule the researcher is trying to read.
 */
export function protocolColor(
  name: ColorReference,
  options?: Readonly<{ dark?: boolean }>,
): string | undefined {
  const prefix = SEQUENCE_PREFIXES.find((candidate) =>
    name.startsWith(candidate),
  );
  if (prefix === undefined) return undefined;

  const themeVariable = `--${prefix.replace('-color-seq-', '-')}${name.slice(prefix.length)}`;
  const reference = `var(${themeVariable})`;
  return options?.dark === true
    ? `oklch(from ${reference} calc(l - 0.05) c h)`
    : reference;
}
