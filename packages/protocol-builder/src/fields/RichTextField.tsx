import { isEqual } from 'es-toolkit/compat';
import { useMemo, useRef } from 'react';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import RichTextEditorField from '@codaco/fresco-ui/form/fields/RichTextEditor';

import {
  markdownToRichTextContent,
  richTextContentToMarkdown,
  type RichTextContent,
} from '../markdown/markdownAdapter.ts';

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
 * surrounding field — pass it through the field wrapper's `label`/`hint`.
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
  const normalizedContent = useMemo(
    () => markdownToRichTextContent(markdown, singleLine),
    [markdown, singleLine],
  );

  // The editor's live document can hold structure markdown cannot express —
  // most visibly the empty paragraph left behind by pressing Enter twice to
  // leave a list. Parsing the stored markdown back into a document drops it,
  // and `RichTextEditorField` applies whatever document it is handed as soon
  // as the field loses focus: the field silently shrinks by a line, and
  // because that happens between mousedown and mouseup, the very click that
  // caused the blur lands on whatever moved under the pointer instead of the
  // control the author aimed at.
  //
  // So hand the editor back its OWN last document whenever that document
  // still serialises to the markdown this field holds — same content, no
  // rewrite, no reflow. A value that did NOT come from this editor (undo,
  // redo, a restored draft, a new stage) does not match and normalises as
  // before.
  const lastEmitted = useRef<{
    markdown: string;
    content: RichTextContent | undefined;
  } | null>(null);
  const content =
    lastEmitted.current?.markdown === markdown
      ? lastEmitted.current.content
      : normalizedContent;

  const handleChange = (nextValue: unknown) => {
    const nextContent = asRichTextContent(nextValue);
    const nextMarkdown = richTextContentToMarkdown(nextContent, singleLine);
    lastEmitted.current = { markdown: nextMarkdown, content: nextContent };

    // The editor emits a change as it mounts. Committing a value that
    // round-trips to the same document would dirty the stage — and add a draft
    // timeline entry — merely by rendering the field.
    if (
      isEqual(
        normalizedContent,
        markdownToRichTextContent(nextMarkdown, singleLine),
      )
    ) {
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
