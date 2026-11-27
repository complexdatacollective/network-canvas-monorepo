import type { RichTextInlineValues } from '../form/fields/richText/inlineValueNode';

/**
 * Inline values for a test or story: each id drawn as a plain pill that says
 * its label (`data-value-pill`), and an id without a label as the id itself.
 * `version` follows the labels, so changing one redraws the values.
 */
export const inlineValuesFor = (
  labels: Readonly<Record<string, string>>,
  extras: Partial<Omit<RichTextInlineValues, 'spec' | 'text' | 'version'>> = {},
): RichTextInlineValues => ({
  spec: (id) => [
    'span',
    {
      'data-value-pill': id,
      'class':
        'inline-flex items-baseline rounded-full border border-current/30 px-2 font-mono text-[0.9em] leading-none',
    },
    labels[id] ?? id,
  ],
  text: (id) => labels[id] ?? id,
  version: JSON.stringify(labels),
  ...extras,
});
