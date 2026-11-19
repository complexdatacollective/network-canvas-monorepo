import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSONContent } from '@tiptap/react';
import { type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  assetBlockControlsProps,
  type RichTextAssetBlockViewProps,
  type RichTextAssetBlocks,
} from '../richText/assetBlockNode';
import RichTextEditorField from '../RichTextEditor';

type FieldProps = ComponentProps<typeof RichTextEditorField>;

const paragraph = (text: string): JSONContent => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

const block = (attrs: Record<string, unknown>): JSONContent => ({
  type: 'assetBlock',
  attrs,
});

const doc = (...content: JSONContent[]): JSONContent => ({
  type: 'doc',
  content,
});

/** A view that shows what it is given and offers each thing it can do. */
function View({
  attributes,
  selected,
  editable,
  update,
  remove,
}: RichTextAssetBlockViewProps) {
  return (
    <div
      data-testid="view"
      data-selected={String(selected)}
      data-editable={String(editable)}
    >
      <output data-testid="attributes">{JSON.stringify(attributes)}</output>
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

const attributesShown = (): Record<string, unknown> =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the stub view writes JSON.stringify of its attributes object
  JSON.parse(screen.getByTestId('attributes').textContent ?? '{}') as Record<
    string,
    unknown
  >;

const renderField = ({
  pick,
  assetBlocks = { pick, View } satisfies RichTextAssetBlocks,
  ...props
}: Partial<FieldProps> & {
  pick?: RichTextAssetBlocks['pick'];
} = {}) => {
  const onChange = vi.fn<(value: JSONContent | undefined) => void>();
  const user = userEvent.setup();
  render(
    <RichTextEditorField
      id="content"
      name="content"
      aria-label="Content"
      changeMode="input"
      value={doc(paragraph('Hello'))}
      onChange={onChange}
      assetBlocks={assetBlocks}
      {...props}
    />,
  );
  return {
    user,
    onChange,
    editor: () => screen.findByRole('textbox', { name: 'Content' }),
    lastDocument: () => onChange.mock.lastCall?.[0],
  };
};

const toolbar = () => within(screen.getByRole('toolbar'));
const names = (elements: HTMLElement[]) =>
  elements.map((element) => element.getAttribute('aria-label'));

const everything: Partial<FieldProps> = {
  toolbarOptions: { links: true, thematicBreak: true },
  tokens: [{ id: 'name', label: 'Name' }],
  insertMenu: { label: 'Insert a value', items: [] },
  logicMenu: { label: 'Insert logic', items: [] },
};

describe('the toolbar of a multi-line field', () => {
  it('has its groups in order, named', async () => {
    const field = renderField({
      ...everything,
      pick: vi.fn(() => Promise.resolve(undefined)),
    });
    await field.editor();

    expect(names(toolbar().getAllByRole('group'))).toEqual([
      'History',
      'Text style',
      'Formatting',
      'Lists',
      'Insert',
      'Insert a placeholder',
    ]);
  });

  it('has its buttons in the order of its groups', async () => {
    const field = renderField({
      ...everything,
      pick: vi.fn(() => Promise.resolve(undefined)),
    });
    await field.editor();

    const buttons = names(toolbar().getAllByRole('button'));
    const inOrder = [
      'Undo',
      'Redo',
      'Heading 1',
      'Heading 4',
      'Bold',
      'Italic',
      'Add link',
      'Bullet list',
      'Numbered list',
      'Insert image',
      'Insert audio',
      'Insert video',
      'Thematic break',
      'Insert emoji',
      'Insert a value',
      'Insert logic',
    ].map((name) => buttons.indexOf(name));
    expect(inOrder).not.toContain(-1);
    expect(inOrder).toEqual(inOrder.toSorted((a, b) => a - b));
    // Bullet before numbered, and the media buttons image, audio, video.
    expect(buttons.indexOf('Bullet list')).toBeLessThan(
      buttons.indexOf('Numbered list'),
    );
    // Each group holds what its name says.
    const group = (name: string) =>
      names(within(screen.getByRole('group', { name })).getAllByRole('button'));
    expect(group('History')).toEqual(['Undo', 'Redo']);
    expect(group('Lists')).toEqual(['Bullet list', 'Numbered list']);
    expect(group('Insert')).toEqual([
      'Insert image',
      'Insert audio',
      'Insert video',
      'Thematic break',
    ]);
  });

  it('puts the emoji button after the insert group and before the placeholders', async () => {
    const field = renderField({
      ...everything,
      pick: vi.fn(() => Promise.resolve(undefined)),
    });
    await field.editor();

    const emoji = toolbar().getByRole('button', { name: 'Insert emoji' });
    const insert = screen.getByRole('group', { name: 'Insert' });
    const placeholders = screen.getByRole('group', {
      name: 'Insert a placeholder',
    });
    expect(insert.compareDocumentPosition(emoji)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(emoji.compareDocumentPosition(placeholders)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('separates consecutive groups with one separator each', async () => {
    const field = renderField({
      ...everything,
      pick: vi.fn(() => Promise.resolve(undefined)),
    });
    await field.editor();

    // Six groups, five gaps: one separator between each pair.
    const separators = toolbar().getAllByRole('separator');
    expect(separators).toHaveLength(5);
  });

  it('leaves out a separator for a group that is not shown', async () => {
    const field = renderField({
      toolbarOptions: {
        history: false,
        headings: false,
        bold: false,
        italic: false,
        lists: true,
      },
      pick: vi.fn(() => Promise.resolve(undefined)),
    });
    await field.editor();

    // Lists, then Insert (media and emoji): two groups, one separator.
    expect(names(toolbar().getAllByRole('group'))).toEqual(['Lists', 'Insert']);
    expect(toolbar().getAllByRole('separator')).toHaveLength(1);
  });

  it('marks every group name as English, since they are read by a screen reader', async () => {
    const field = renderField({
      ...everything,
      pick: vi.fn(() => Promise.resolve(undefined)),
    });
    await field.editor();

    for (const group of toolbar().getAllByRole('group')) {
      expect(group.getAttribute('lang')).toBe('en');
    }
  });
});

describe('the toolbar without media', () => {
  it('offers no insert-media button without assetBlocks', async () => {
    const field = renderField({ ...everything, assetBlocks: undefined });
    await field.editor();

    const buttons = names(toolbar().getAllByRole('button'));
    expect(buttons).not.toContain('Insert image');
    expect(buttons).not.toContain('Insert audio');
    expect(buttons).not.toContain('Insert video');
    // The rest of the Insert group is still there.
    expect(buttons).toContain('Thematic break');
  });

  it('offers no insert-media button when assetBlocks has no pick', async () => {
    const field = renderField({ ...everything, pick: undefined });
    await field.editor();

    const buttons = names(toolbar().getAllByRole('button'));
    expect(buttons).not.toContain('Insert image');
    expect(buttons).not.toContain('Insert video');
  });

  it('has no Insert group when nothing is left to put in it', async () => {
    const field = renderField({
      assetBlocks: undefined,
      emojiMenu: false,
    });
    await field.editor();

    expect(screen.queryByRole('group', { name: 'Insert' })).toBeNull();
  });
});

describe('the toolbar of a single-line field', () => {
  it('has only what a line can hold, and ignores assetBlocks', async () => {
    const field = renderField({
      singleLine: true,
      tokens: [{ id: 'name', label: 'Name' }],
      pick: vi.fn(() => Promise.resolve('a1')),
    });
    await field.editor();

    expect(names(toolbar().getAllByRole('group'))).toEqual([
      'History',
      'Formatting',
      'Insert a placeholder',
    ]);
    const buttons = names(toolbar().getAllByRole('button'));
    expect(buttons).not.toContain('Insert image');
    expect(buttons).not.toContain('Insert audio');
    expect(buttons).not.toContain('Insert video');
    expect(buttons).not.toContain('Heading 1');
    expect(buttons).not.toContain('Bullet list');
  });

  it('draws no block for a block its value holds', async () => {
    const field = renderField({
      singleLine: true,
      value: doc(
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Line' }],
        },
        block({ assetId: 'a1' }),
      ),
      pick: vi.fn(() => Promise.resolve('a1')),
    });
    await field.editor();

    expect(screen.queryByTestId('view')).toBeNull();
  });
});

describe('inserting a block', () => {
  it('puts a block with default attributes at the caret, after the text typed before it', async () => {
    const pick = vi.fn(() => Promise.resolve('a1'));
    const field = renderField({ pick, value: doc(paragraph('Hello')) });
    const editor = await field.editor();

    await field.user.click(editor);
    await field.user.keyboard('!');
    await field.user.click(
      toolbar().getByRole('button', { name: 'Insert image' }),
    );

    expect(pick).toHaveBeenCalledExactlyOnceWith('image');
    await waitFor(() => {
      expect(screen.getByTestId('view')).toBeInTheDocument();
    });
    expect(attributesShown()).toEqual({
      assetId: 'a1',
      description: '',
      size: null,
      align: 'center',
      autoplay: true,
      loop: true,
    });
    const emitted = field.lastDocument();
    // The caret was after the "!" typed at the start of the line: the block
    // splits the paragraph there, and the rest of the text follows it.
    expect(emitted?.content?.[0]).toEqual(paragraph('!'));
    expect(emitted?.content?.[1]).toMatchObject({
      type: 'assetBlock',
      attrs: { assetId: 'a1' },
    });
    expect(emitted?.content?.[2]).toEqual(paragraph('Hello'));
  });

  it.each(['image', 'audio', 'video'] as const)(
    'asks the picker for %s from its own button',
    async (kind) => {
      const pick = vi.fn(() => Promise.resolve(undefined));
      const field = renderField({ pick });
      await field.editor();

      await field.user.click(
        toolbar().getByRole('button', { name: `Insert ${kind}` }),
      );

      expect(pick).toHaveBeenCalledExactlyOnceWith(kind);
    },
  );

  it('leaves a paragraph to type in after a block that would end the document', async () => {
    const field = renderField({
      pick: () => Promise.resolve('a1'),
      value: doc({ type: 'paragraph' }),
    });
    const editor = await field.editor();

    await field.user.click(editor);
    await field.user.click(
      toolbar().getByRole('button', { name: 'Insert image' }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('view')).toBeInTheDocument();
    });
    const types = field.lastDocument()?.content?.map(({ type }) => type);
    expect(types).toEqual(['assetBlock', 'paragraph']);
    expect(field.lastDocument()?.content?.at(-1)).toEqual({
      type: 'paragraph',
    });
  });

  it('inserts nothing when the picker chooses nothing', async () => {
    const pick = vi.fn(() => Promise.resolve(undefined));
    const field = renderField({ pick });
    const editor = await field.editor();

    await field.user.click(editor);
    await field.user.click(
      toolbar().getByRole('button', { name: 'Insert image' }),
    );

    await waitFor(() => {
      expect(pick).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('view')).toBeNull();
    expect(field.onChange).not.toHaveBeenCalled();
  });
});

describe('a block the value holds', () => {
  it('is drawn by the consumer’s view with its attributes normalised', async () => {
    const field = renderField({
      value: doc(
        paragraph('Before'),
        block({
          assetId: 'a1',
          description: 'A map',
          size: 'enormous',
          align: 'sideways',
          autoplay: false,
        }),
        paragraph('After'),
      ),
    });
    await field.editor();

    expect(attributesShown()).toEqual({
      assetId: 'a1',
      description: 'A map',
      size: null,
      align: 'center',
      autoplay: false,
      loop: true,
    });
    expect(screen.getByTestId('view')).toHaveAttribute('data-editable', 'true');
  });

  it('keeps a valid size and alignment', async () => {
    const field = renderField({
      value: doc(
        block({ assetId: 'a1', size: 'small', align: 'end', loop: false }),
        paragraph('After'),
      ),
    });
    await field.editor();

    expect(attributesShown()).toMatchObject({
      size: 'small',
      align: 'end',
      loop: false,
    });
  });

  it('changes its attributes when the view updates them, and says so', async () => {
    const field = renderField({
      value: doc(block({ assetId: 'a1' }), paragraph('After')),
    });
    await field.editor();

    await field.user.click(screen.getByRole('button', { name: 'Make large' }));

    await waitFor(() => {
      expect(attributesShown().size).toBe('large');
    });
    expect(field.lastDocument()?.content?.[0]).toMatchObject({
      type: 'assetBlock',
      attrs: { assetId: 'a1', size: 'large' },
    });
  });

  it('is deleted when the view removes it, leaving the text', async () => {
    const field = renderField({
      value: doc(
        paragraph('Before'),
        block({ assetId: 'a1' }),
        paragraph('After'),
      ),
    });
    await field.editor();

    await field.user.click(
      screen.getByRole('button', { name: 'Remove block' }),
    );

    await waitFor(() => {
      expect(screen.queryByTestId('view')).toBeNull();
    });
    expect(field.lastDocument()?.content).toEqual([
      paragraph('Before'),
      paragraph('After'),
    ]);
  });
});

describe('typing where a block is', () => {
  it('opens with the caret in the last text, not on a block that ends it', async () => {
    const field = renderField({
      autoFocus: true,
      value: doc(paragraph('Before'), block({ assetId: 'a1' })),
    });
    const editor = await field.editor();
    await waitFor(() => {
      expect(editor).toHaveFocus();
    });
    expect(screen.getByTestId('view')).toHaveAttribute(
      'data-selected',
      'false',
    );

    await field.user.keyboard('!');

    await waitFor(() => {
      expect(field.lastDocument()?.content?.[0]).toEqual(paragraph('Before!'));
    });
    expect(field.lastDocument()?.content?.[1]).toMatchObject({
      type: 'assetBlock',
      attrs: { assetId: 'a1' },
    });
  });

  it('starts a paragraph below a selected block rather than typing over it', async () => {
    // Nothing but a block, so the field can only open with it selected.
    const field = renderField({
      autoFocus: true,
      value: doc(block({ assetId: 'a1' })),
    });
    const editor = await field.editor();
    await waitFor(() => {
      expect(editor).toHaveFocus();
    });
    await waitFor(() => {
      expect(screen.getByTestId('view')).toHaveAttribute(
        'data-selected',
        'true',
      );
    });

    await field.user.keyboard('Hi');

    await waitFor(() => {
      expect(field.lastDocument()?.content?.[1]).toEqual(paragraph('Hi'));
    });
    expect(field.lastDocument()?.content).toHaveLength(2);
    expect(field.lastDocument()?.content?.[0]).toMatchObject({
      type: 'assetBlock',
      attrs: { assetId: 'a1' },
    });
  });
});

describe('a field that cannot be edited', () => {
  it.each([
    ['disabled', { disabled: true }],
    ['read-only', { readOnly: true }],
  ] as const)('disables the insert buttons when %s', async (_kind, props) => {
    const field = renderField({
      ...props,
      pick: vi.fn(() => Promise.resolve('a1')),
    });
    await field.editor();

    for (const name of ['Insert image', 'Insert audio', 'Insert video']) {
      expect(toolbar().getByRole('button', { name })).toBeDisabled();
    }
  });

  it('tells the view it cannot edit', async () => {
    const field = renderField({
      readOnly: true,
      value: doc(block({ assetId: 'a1' }), paragraph('After')),
    });
    await field.editor();

    expect(screen.getByTestId('view')).toHaveAttribute(
      'data-editable',
      'false',
    );
  });
});
