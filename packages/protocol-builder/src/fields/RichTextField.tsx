import { isEqual } from 'es-toolkit/compat';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import RichTextEditorField, {
  type RichTextAssetBlocks,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';

import { richTextToolbarFor } from '../localization/textShape.ts';
import { useMessageDocument } from '../localization/useMessageDocument.ts';
import {
  markdownToRichTextContent,
  richTextContentToMarkdown,
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
     *
     * The editor is told too, not just the markdown conversion: the restriction
     * is a promise about the value, and a document the editor was free to split
     * left the serializer joining two paragraphs into one line by inventing a
     * separator — "Never met" saved as " Never met".
     *
     * The editor opens one line tall and grows as the text wraps.
     *
     * For a localized field, take it from the field's declaration
     * (`textFieldPropsFor`) rather than writing it here.
     */
    'singleLine'?: boolean;
    /** Toolbar features to withhold, e.g. `['bold', 'lists']`. */
    'disallowedTypes'?: string[];
    /**
     * How the files the text holds as blocks are drawn and chosen, for text
     * declared to hold them (`textFieldPropsFor`). Absent for any other
     * text, where an image written into it is read as its description.
     */
    'assetBlocks'?: RichTextAssetBlocks;
  }
>;

/**
 * Markdown editor over a plain markdown string. Labelling belongs to the
 * surrounding field — pass it through the field wrapper's `label`/`hint`.
 */
const RichTextField = ({
  value,
  onChange,
  singleLine = false,
  disallowedTypes = [],
  assetBlocks,
  ...props
}: RichTextFieldProps) => {
  const holdsAssetBlocks = assetBlocks !== undefined;
  const toolbarOptions = richTextToolbarFor(singleLine, disallowedTypes);

  const readOptions = { inline: singleLine, assetBlocks: holdsAssetBlocks };
  const editorDocument = useMessageDocument({
    text: typeof value === 'string' ? value : '',
    openKey: `${singleLine}:${holdsAssetBlocks}`,
    open: (markdown) => markdownToRichTextContent(markdown, readOptions),
    write: (document) => richTextContentToMarkdown(document, singleLine),
    // The editor emits a change as it mounts, and the markdown it writes can
    // be spelled differently from the stored markdown. Markdown that opens
    // as the same document is not written, so that drawing the field does
    // not change the stage.
    holds: (written, opened) =>
      isEqual(opened, markdownToRichTextContent(written, readOptions)),
    onWrite: (written) => onChange?.(written ?? ''),
  });

  return (
    <RichTextEditorField
      {...props}
      singleLine={singleLine}
      changeMode="input"
      toolbarOptions={toolbarOptions}
      {...(assetBlocks !== undefined && { assetBlocks })}
      value={editorDocument.content}
      onChange={editorDocument.onDocumentChange}
    />
  );
};

export default RichTextField;
