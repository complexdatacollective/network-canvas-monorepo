import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSONContent } from '@tiptap/react';
import type { ComponentProps } from 'react';
import { vi } from 'vitest';

import {
  assetBlockControlsProps,
  type RichTextAssetBlockViewProps,
  type RichTextAssetBlocks,
} from '../richText/assetBlockNode';
import { blockBoxProps } from '../richText/blockFrames';
import RichTextEditorField from '../RichTextEditor';

export type FieldProps = ComponentProps<typeof RichTextEditorField>;

export const paragraph = (text: string): JSONContent => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

export const heading = (level: number, text: string): JSONContent => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
});

/** A block as a value may hold it, attributes and all, valid or not. */
export const block = (attrs: Record<string, unknown>): JSONContent => ({
  type: 'assetBlock',
  attrs,
});

export const doc = (...content: JSONContent[]): JSONContent => ({
  type: 'doc',
  content,
});

/** A view that shows what it is given and offers each thing it can do. */
function View({
  attributes,
  selected,
  editable,
  active,
  update,
  remove,
  resizeHandle,
  resizing,
}: RichTextAssetBlockViewProps) {
  return (
    <div
      data-testid="view"
      data-selected={String(selected)}
      data-editable={String(editable)}
      data-active={String(active)}
    >
      <output data-testid="attributes">{JSON.stringify(attributes)}</output>
      <div
        data-testid="picture"
        data-resizing={
          resizing === undefined ? undefined : String(resizing.size)
        }
        {...blockBoxProps(true)}
      >
        {resizeHandle}
      </div>
      <div {...assetBlockControlsProps}>
        <button type="button" onClick={() => update({ size: 'large' })}>
          Make large
        </button>
        <button type="button" onClick={() => remove()}>
          Remove block
        </button>
      </div>
    </div>
  );
}

/**
 * Draws a multi-line field labelled "Content" that holds files as blocks
 * (drawn by `View`, chosen by `pick`), saying every change as it is made.
 */
export const renderField = ({
  pick,
  assetBlocks = { pick, View } satisfies RichTextAssetBlocks,
  ...props
}: Partial<FieldProps> & {
  pick?: RichTextAssetBlocks['pick'];
} = {}) => {
  const onChange = vi.fn<(value: JSONContent | undefined) => void>();
  const user = userEvent.setup();
  const field = (changed: Partial<FieldProps> = {}) => (
    <RichTextEditorField
      id="content"
      name="content"
      aria-label="Content"
      changeMode="input"
      value={doc(paragraph('Hello'))}
      onChange={onChange}
      assetBlocks={assetBlocks}
      {...props}
      {...changed}
    />
  );
  const { rerender } = render(field());
  return {
    user,
    onChange,
    /** Draws the field again with some of its props changed. */
    change: (changed: Partial<FieldProps>) => rerender(field(changed)),
    editor: () => screen.findByRole('textbox', { name: 'Content' }),
    lastDocument: () => onChange.mock.lastCall?.[0],
  };
};
