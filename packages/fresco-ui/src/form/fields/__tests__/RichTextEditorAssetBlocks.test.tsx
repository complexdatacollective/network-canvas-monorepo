import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSONContent } from '@tiptap/react';
import { type ComponentProps, useState } from 'react';
import { createPortal } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';

import { headingVariants } from '../../../typography/Heading';
import { paragraphVariants } from '../../../typography/Paragraph';
import {
  assetBlockControlsAt,
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
  active,
  update,
  remove,
}: RichTextAssetBlockViewProps) {
  return (
    <div
      data-testid="view"
      data-selected={String(selected)}
      data-editable={String(editable)}
      data-active={String(active)}
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

const toolbar = () => within(screen.getByRole('toolbar'));
// What a control is called: its label, or failing that the words it shows.
const names = (elements: HTMLElement[]) =>
  elements.map(
    (element) => element.getAttribute('aria-label') ?? element.textContent,
  );
const textStyle = () =>
  toolbar().getByRole('button', { name: /^Text style: / });

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
      'Formatting',
      'Lists',
      'Insert',
      'Insert a file',
      'Insert a placeholder',
    ]);
  });

  it('has its controls in the order of its groups', async () => {
    const field = renderField({
      ...everything,
      pick: vi.fn(() => Promise.resolve(undefined)),
    });
    await field.editor();

    const buttons = names(toolbar().getAllByRole('button'));
    const inOrder = [
      'Undo',
      'Redo',
      'Text style: Paragraph',
      'Bold',
      'Italic',
      'Bullet list',
      'Numbered list',
      'Add link',
      'Thematic break',
      'Insert emoji',
      'Insert image',
      'Insert audio',
      'Insert video',
      'Insert a value',
      'Insert logic',
    ].map((name) => buttons.indexOf(name));
    expect(inOrder).not.toContain(-1);
    expect(inOrder).toEqual(inOrder.toSorted((a, b) => a - b));
    // Each group holds what its name says.
    const group = (name: string) =>
      names(within(screen.getByRole('group', { name })).getAllByRole('button'));
    expect(group('History')).toEqual(['Undo', 'Redo']);
    expect(group('Formatting')).toEqual(['Bold', 'Italic']);
    expect(group('Lists')).toEqual(['Bullet list', 'Numbered list']);
    expect(group('Insert')).toEqual([
      'Add link',
      'Thematic break',
      'Insert emoji',
    ]);
    expect(group('Insert a file')).toEqual([
      'Insert image',
      'Insert audio',
      'Insert video',
    ]);
  });

  it('makes no group of a control that stands alone', async () => {
    const field = renderField({
      toolbarOptions: {
        history: false,
        headings: true,
        bold: false,
        italic: false,
        lists: true,
      },
      pick: vi.fn(() => Promise.resolve(undefined)),
    });
    await field.editor();

    // The list of text styles and the emoji button each stand alone; the
    // lists and the files are groups.
    expect(names(toolbar().getAllByRole('group'))).toEqual([
      'Lists',
      'Insert a file',
    ]);
    expect(textStyle()).toBeInTheDocument();
    expect(
      toolbar().getByRole('button', { name: 'Insert emoji' }),
    ).toBeInTheDocument();
  });

  it('keeps a lone toggle in its group, which is what makes it a toggle', async () => {
    const field = renderField({ toolbarOptions: { italic: false } });
    await field.editor();

    const formatting = screen.getByRole('group', { name: 'Formatting' });
    expect(names(within(formatting).getAllByRole('button'))).toEqual(['Bold']);
    expect(within(formatting).getByRole('button')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  // The rules between groups are drawn, not announced: the groups are what a
  // screen reader is told, and a rule that started a line would be one too
  // many (see `toolbarClipStyles`).
  it('has no separators, and a rule only before the first control of a group', async () => {
    const field = renderField({
      ...everything,
      pick: vi.fn(() => Promise.resolve(undefined)),
    });
    await field.editor();

    expect(toolbar().queryAllByRole('separator')).toHaveLength(0);
    const firstOfAGroup = [
      'Undo',
      'Text style: Paragraph',
      'Bold',
      'Bullet list',
      'Add link',
      'Insert image',
      'Insert a value',
    ];
    for (const button of toolbar().getAllByRole('button')) {
      const [name] = names([button]);
      // Each control is one piece with the space before it.
      const lead = button.previousElementSibling;
      expect(lead).toHaveAttribute('aria-hidden', 'true');
      expect(lead?.childElementCount, name ?? '').toBe(
        firstOfAGroup.includes(name ?? '') ? 1 : 0,
      );
    }
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

const heading = (level: number, text: string): JSONContent => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
});

describe('the text style of a line', () => {
  it('is said by the control that changes it', async () => {
    const field = renderField({
      value: doc(heading(2, 'Title'), paragraph('Words')),
    });
    const editor = await field.editor();

    await field.user.click(within(editor).getByText('Title'));
    await waitFor(() => {
      expect(textStyle()).toHaveAccessibleName('Text style: Heading 2');
    });
    await field.user.click(within(editor).getByText('Words'));
    await waitFor(() => {
      expect(textStyle()).toHaveAccessibleName('Text style: Paragraph');
    });
  });

  it('lists a paragraph and each heading the field allows, with the line’s own marked', async () => {
    const field = renderField({
      toolbarOptions: { headings: { h3: false, h4: false } },
      value: doc(heading(2, 'Title')),
    });
    const editor = await field.editor();
    await field.user.click(within(editor).getByText('Title'));

    await field.user.click(textStyle());
    const styles = await screen.findAllByRole('menuitemradio');
    expect(styles.map((style) => style.textContent)).toEqual([
      'Paragraph',
      'Heading 1',
      'Heading 2',
    ]);
    expect(
      styles.filter((style) => style.getAttribute('aria-checked') === 'true'),
    ).toEqual([screen.getByRole('menuitemradio', { name: 'Heading 2' })]);
  });

  it('sets each style’s name in that style, as a line of it is set without its spacing', async () => {
    const field = renderField({ value: doc(paragraph('Hello')) });
    await field.editor();

    await field.user.click(textStyle());
    await screen.findAllByRole('menuitemradio');
    // The name is the item's last child: the tick before it is the same in
    // every item.
    const nameOf = (name: string) =>
      screen.getByRole('menuitemradio', { name }).lastElementChild;
    expect(nameOf('Paragraph')).toHaveClass(
      paragraphVariants({ margin: 'none' }),
      { exact: true },
    );
    for (const level of [1, 2, 3, 4] as const) {
      expect(nameOf(`Heading ${level}`)).toHaveClass(
        headingVariants({ level: `h${level}`, margin: 'none' }),
        { exact: true },
      );
    }
  });

  it('changes the line to the style chosen, and puts the caret back in it', async () => {
    const field = renderField({ value: doc(paragraph('Hello')) });
    const editor = await field.editor();
    await field.user.click(within(editor).getByText('Hello'));

    await field.user.click(textStyle());
    await field.user.click(
      await screen.findByRole('menuitemradio', { name: 'Heading 1' }),
    );

    await waitFor(() => {
      expect(field.lastDocument()).toEqual(doc(heading(1, 'Hello')));
    });
    // Choosing closes the list: it is one choice, not a set of switches.
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(editor).toHaveFocus();
    });
    // Typed where the caret was left: a click here puts it at the line's start.
    await field.user.keyboard('!');
    await waitFor(() => {
      expect(field.lastDocument()).toEqual(doc(heading(1, '!Hello')));
    });

    // And back to a paragraph, which no button of its own offered before.
    await field.user.click(textStyle());
    await field.user.click(
      await screen.findByRole('menuitemradio', { name: 'Paragraph' }),
    );
    await waitFor(() => {
      expect(field.lastDocument()).toEqual(doc(paragraph('!Hello')));
    });
  });

  // A field that cannot be edited changes nothing: whatever its toolbar had
  // open when it became so closes, as its link and insert menus do.
  it.each([{ disabled: true }, { readOnly: true }])(
    'closes its list, and changes nothing, once the field cannot be edited (%j)',
    async (unavailable) => {
      const field = renderField({ value: doc(paragraph('Hello')) });
      await field.editor();
      await field.user.click(textStyle());
      const heading1 = await screen.findByRole('menuitemradio', {
        name: 'Heading 1',
      });
      field.change(unavailable);
      // A choice made as the field changes is not taken either.
      fireEvent.click(heading1);

      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
      // Whatever the field has said of its text since, it is the same text.
      expect(field.lastDocument() ?? doc(paragraph('Hello'))).toEqual(
        doc(paragraph('Hello')),
      );
    },
  );

  it('leaves focus on its control when its list is closed with nothing chosen', async () => {
    const field = renderField({ value: doc(paragraph('Hello')) });
    await field.editor();

    await field.user.click(textStyle());
    await screen.findByRole('menuitemradio', { name: 'Paragraph' });
    await waitFor(() => {
      expect(screen.getByRole('menu')).toContainElement(
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
      );
    });
    await field.user.keyboard('{Escape}');

    await waitFor(() => {
      expect(textStyle()).toHaveFocus();
    });
    expect(field.onChange).not.toHaveBeenCalled();
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

    // The one placeholder and the emoji button each stand alone.
    expect(names(toolbar().getAllByRole('group'))).toEqual([
      'History',
      'Formatting',
    ]);
    expect(names(toolbar().getAllByRole('button'))).toEqual([
      'Undo',
      'Redo',
      'Bold',
      'Italic',
      'Insert emoji',
      'Insert “Name”',
    ]);
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
    // And it is the block that is selected, with the keyboard in the field:
    // that is when a view shows what changes it.
    await waitFor(() => {
      expect(screen.getByTestId('view')).toHaveAttribute(
        'data-selected',
        'true',
      );
    });
    expect(screen.getByTestId('view')).toHaveAttribute('data-active', 'true');
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
    // The block is selected there too, and not the paragraph that came with it.
    await waitFor(() => {
      expect(screen.getByTestId('view')).toHaveAttribute(
        'data-selected',
        'true',
      );
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

  // A view may draw a player, which reads its file when it is made: given
  // another file, the view is made again rather than handed the new one.
  it('makes its view again when the file changes, and keeps it when a setting does', async () => {
    let made = 0;
    function CountedView({ attributes, update }: RichTextAssetBlockViewProps) {
      const [number] = useState(() => {
        made += 1;
        return made;
      });
      return (
        <div data-testid="counted" data-made={number}>
          {attributes.assetId}
          <div {...assetBlockControlsProps}>
            <button type="button" onClick={() => update({ size: 'small' })}>
              Make small
            </button>
            <button type="button" onClick={() => update({ assetId: 'a2' })}>
              Change file
            </button>
          </div>
        </div>
      );
    }
    const field = renderField({
      assetBlocks: { View: CountedView },
      value: doc(block({ assetId: 'a1' }), paragraph('After')),
    });
    await field.editor();
    const first = screen.getByTestId('counted').getAttribute('data-made');

    await field.user.click(screen.getByRole('button', { name: 'Make small' }));
    await waitFor(() => {
      expect(field.lastDocument()?.content?.[0]).toMatchObject({
        attrs: { size: 'small' },
      });
    });
    expect(screen.getByTestId('counted')).toHaveAttribute('data-made', first);

    await field.user.click(screen.getByRole('button', { name: 'Change file' }));
    await waitFor(() => {
      expect(screen.getByTestId('counted')).toHaveTextContent('a2');
    });
    expect(screen.getByTestId('counted')).not.toHaveAttribute(
      'data-made',
      first,
    );
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

  it('returns focus to the text when the view removes it from a control', async () => {
    const field = renderField({
      value: doc(
        paragraph('Before'),
        block({ assetId: 'a1' }),
        paragraph('After'),
      ),
    });
    const editor = await field.editor();

    const remove = screen.getByRole('button', { name: 'Remove block' });
    await field.user.click(remove);
    await waitFor(() => {
      expect(screen.queryByTestId('view')).toBeNull();
    });

    expect(editor).toHaveFocus();
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

describe('a block in a selection of text', () => {
  // The element the field draws around the consumer's view.
  const blockElement = () =>
    screen.getByTestId('view').closest('[data-asset-block]');

  it('is marked as selected text when a selection runs across it', async () => {
    const field = renderField({
      value: doc(
        paragraph('Before'),
        block({ assetId: 'a1' }),
        paragraph('After'),
      ),
    });
    const editor = await field.editor();
    await field.user.click(within(editor).getByText('After'));
    expect(blockElement()).not.toHaveAttribute('data-in-selected-text');

    await field.user.keyboard('{Control>}a{/Control}');
    await waitFor(() => {
      expect(blockElement()).toHaveAttribute('data-in-selected-text');
    });
    // The block is part of a selection, not the selection itself.
    expect(screen.getByTestId('view')).toHaveAttribute(
      'data-selected',
      'false',
    );
  });

  it('is not marked once focus leaves the field', async () => {
    const field = renderField({
      value: doc(
        paragraph('Before'),
        block({ assetId: 'a1' }),
        paragraph('After'),
      ),
    });
    const editor = await field.editor();
    render(<button type="button">Elsewhere</button>);
    await field.user.click(within(editor).getByText('After'));
    await field.user.keyboard('{Control>}a{/Control}');
    await waitFor(() => {
      expect(blockElement()).toHaveAttribute('data-in-selected-text');
    });

    await field.user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    await waitFor(() => {
      expect(blockElement()).not.toHaveAttribute('data-in-selected-text');
    });
  });

  it('is outlined, not marked, when it is the selection by itself', async () => {
    // Nothing but a block, so the field can only open with it selected.
    const field = renderField({
      autoFocus: true,
      value: doc(block({ assetId: 'a1' })),
    });
    await field.editor();
    await waitFor(() => {
      expect(screen.getByTestId('view')).toHaveAttribute(
        'data-selected',
        'true',
      );
    });
    expect(blockElement()).toHaveAttribute('data-selected');
    expect(blockElement()).not.toHaveAttribute('data-in-selected-text');
  });
});

describe('where focus is', () => {
  it('is told to the view: in the field, or out of it', async () => {
    const field = renderField({
      value: doc(block({ assetId: 'a1' }), paragraph('After')),
    });
    const editor = await field.editor();
    render(<button type="button">Elsewhere</button>);
    expect(screen.getByTestId('view')).toHaveAttribute('data-active', 'false');

    await field.user.click(within(editor).getByText('After'));
    await waitFor(() => {
      expect(screen.getByTestId('view')).toHaveAttribute('data-active', 'true');
    });

    // In one of the view's own controls it is still in the field.
    await field.user.click(screen.getByRole('button', { name: 'Make large' }));
    await waitFor(() => {
      expect(attributesShown().size).toBe('large');
    });
    expect(screen.getByTestId('view')).toHaveAttribute('data-active', 'true');

    await field.user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    await waitFor(() => {
      expect(screen.getByTestId('view')).toHaveAttribute(
        'data-active',
        'false',
      );
    });
  });
});

/** A view whose controls are not in the block but over the page. */
function ViewWithControlsElsewhere({
  selected,
  active,
  returnToText,
}: RichTextAssetBlockViewProps) {
  return (
    <div data-testid="view" {...assetBlockControlsAt('controls-of-a1')}>
      {selected &&
        active &&
        createPortal(
          <div id="controls-of-a1">
            <span tabIndex={-1}>Not a control</span>
            <input aria-label="Description" />
            <button type="button" onClick={returnToText}>
              Back to the text
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

describe('controls a view draws over the page', () => {
  // Nothing but a block, so the field can only open with it selected: the
  // arrow keys are not something jsdom moves a caret with.
  const openOnBlock = async () => {
    const field = renderField({
      autoFocus: true,
      assetBlocks: { View: ViewWithControlsElsewhere },
      value: doc(block({ assetId: 'a1' })),
    });
    const editor = await field.editor();
    await waitFor(() => {
      expect(editor).toHaveFocus();
    });
    await screen.findByRole('textbox', { name: 'Description' });
    return { field, editor };
  };

  it('are reached with Enter on the selected block, at the first of them', async () => {
    const { field } = await openOnBlock();

    await field.user.keyboard('{Enter}');

    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveFocus();
    // Enter went to the controls: it started no paragraph.
    expect(field.onChange).not.toHaveBeenCalled();
  });

  it('stay while focus is in them, and hand it back to the block', async () => {
    const { field, editor } = await openOnBlock();
    await field.user.keyboard('{Enter}');
    await field.user.keyboard('A harbour');
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue(
      'A harbour',
    );

    await field.user.click(
      screen.getByRole('button', { name: 'Back to the text' }),
    );

    await waitFor(() => {
      expect(editor).toHaveFocus();
    });
    // The block is still the selection, so its controls are still there.
    expect(
      screen.getByRole('textbox', { name: 'Description' }),
    ).toBeInTheDocument();
    expect(field.onChange).not.toHaveBeenCalled();
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

  // The view is the consumer's and may be showing a control at the moment
  // the field stops being editable: a form disables its fields as it submits.
  it.each([
    ['disabled', { disabled: true }],
    ['read-only', { readOnly: true }],
  ] as const)(
    'tells a view already drawn when the field becomes %s, and changes nothing for it',
    async (_kind, props) => {
      const value = doc(block({ assetId: 'a1' }), paragraph('After'));
      const field = renderField({ value });
      await field.editor();
      expect(screen.getByTestId('view')).toHaveAttribute(
        'data-editable',
        'true',
      );

      field.change(props);

      await waitFor(() => {
        expect(screen.getByTestId('view')).toHaveAttribute(
          'data-editable',
          'false',
        );
      });
      await field.user.click(
        screen.getByRole('button', { name: 'Make large' }),
      );
      await field.user.click(
        screen.getByRole('button', { name: 'Remove block' }),
      );

      expect(attributesShown()).toMatchObject({ assetId: 'a1', size: null });
      expect(field.onChange).not.toHaveBeenCalled();

      // And it can be changed again once the field can.
      field.change({ disabled: false, readOnly: false });
      await waitFor(() => {
        expect(screen.getByTestId('view')).toHaveAttribute(
          'data-editable',
          'true',
        );
      });
      await field.user.click(
        screen.getByRole('button', { name: 'Make large' }),
      );
      await waitFor(() => {
        expect(attributesShown().size).toBe('large');
      });
    },
  );
});
