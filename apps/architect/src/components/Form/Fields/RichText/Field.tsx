import { isEqual } from 'es-toolkit/compat';
import { useMemo } from 'react';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import RichTextEditorField from '@codaco/fresco-ui/form/fields/RichTextEditor';
import {
  markdownToRichTextContent,
  richTextContentToMarkdown,
  type RichTextContent,
} from '~/utils/markdownAdapter';

type RichTextFieldProps = CreateFormFieldProps<
  string,
  'div',
  {
    // Mirrors the props `RichTextEditorField` requires: this field only ever
    // renders inside a fresco-ui `Field`, which always injects them.
    'id': string;
    'name': string;
    'aria-describedby': string;
    'placeholder'?: string;
    'autoFocus'?: boolean;
    /**
     * Restricts the editor to a single paragraph of markdown (no headings,
     * lists, links or rules). Named for the markdown mode rather than `inline`,
     * which fresco-ui's `Field` reserves for its label/control layout.
     */
    'singleLine'?: boolean;
    /** Toolbar features to withhold, e.g. `['bold', 'lists']`. */
    'disallowedTypes'?: string[];
  }
>;

const asRichTextContent = (value: unknown): RichTextContent | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RichTextContent)
    : undefined;

/**
 * Markdown editor over a plain markdown string. Labelling belongs to the
 * surrounding field — pass it through `ArchitectField`'s `label`/`hint`.
 */
const RichTextField = ({
  value,
  onChange,
  singleLine = false,
  disallowedTypes = [],
  ...props
}: RichTextFieldProps) => {
  const toolbarOptions = {
    bold: !disallowedTypes.includes('bold'),
    italic: !disallowedTypes.includes('italic'),
    links: !singleLine,
    headings: !singleLine && !disallowedTypes.includes('headings'),
    lists: !singleLine && !disallowedTypes.includes('lists'),
    thematicBreak: !singleLine && !disallowedTypes.includes('thematic_break'),
    history: !disallowedTypes.includes('history'),
  };

  const markdown = typeof value === 'string' ? value : null;
  const content = useMemo(
    () => markdownToRichTextContent(markdown, singleLine),
    [markdown, singleLine],
  );

  const handleChange = (nextValue: unknown) => {
    const nextMarkdown = richTextContentToMarkdown(
      asRichTextContent(nextValue),
      singleLine,
    );

    // The editor emits a change as it mounts. Committing a value that
    // round-trips to the same document would dirty the stage — and add a draft
    // timeline entry — merely by rendering the field.
    if (isEqual(content, markdownToRichTextContent(nextMarkdown, singleLine))) {
      return;
    }

    onChange?.(nextMarkdown);
  };

  return (
    <RichTextEditorField
      {...props}
      changeMode="input"
      toolbarOptions={toolbarOptions}
      value={content}
      onChange={handleChange}
    />
  );
};

export default RichTextField;
