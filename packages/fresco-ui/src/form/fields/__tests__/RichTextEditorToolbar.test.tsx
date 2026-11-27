import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { inlineValuesFor } from '../../../testing/inlineValues';
import { headingVariants } from '../../../typography/Heading';
import { paragraphVariants } from '../../../typography/Paragraph';
import { ToolbarButton, toolbarLabelledButtonStyles } from '../RichTextEditor';
import {
  doc,
  type FieldProps,
  heading,
  paragraph,
  renderField,
} from './richTextEditorField';

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
  inlineValues: inlineValuesFor({ name: 'Name' }),
  insertTools: {
    label: 'Insert an attribute or logic block',
    render: () => (
      <>
        <ToolbarButton className={toolbarLabelledButtonStyles}>
          Attribute
        </ToolbarButton>
        <ToolbarButton className={toolbarLabelledButtonStyles}>
          Logic block
        </ToolbarButton>
      </>
    ),
  },
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
      'Insert a link, break or emoji',
      'Insert an attribute or logic block',
      'Insert a file',
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
      'Attribute',
      'Logic block',
      'Insert image',
      'Insert audio',
      'Insert video',
    ].map((name) => buttons.indexOf(name));
    expect(inOrder).not.toContain(-1);
    expect(inOrder).toEqual(inOrder.toSorted((a, b) => a - b));
    // Each group holds what its name says.
    const group = (name: string) =>
      names(within(screen.getByRole('group', { name })).getAllByRole('button'));
    expect(group('History')).toEqual(['Undo', 'Redo']);
    expect(group('Formatting')).toEqual(['Bold', 'Italic']);
    expect(group('Lists')).toEqual(['Bullet list', 'Numbered list']);
    expect(group('Insert a link, break or emoji')).toEqual([
      'Add link',
      'Thematic break',
      'Insert emoji',
    ]);
    // The consumer's insert tools are one entry of their group, however
    // many controls they draw, and their group takes the consumer's name.
    expect(group('Insert an attribute or logic block')).toEqual([
      'Attribute',
      'Logic block',
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
  // many (see `EditorToolbar`).
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
      'Attribute',
      'Insert image',
    ];
    for (const button of toolbar().getAllByRole('button')) {
      const [name] = names([button]);
      // The first control of a group is one piece with the rule before it;
      // every other control sits right after the one before it.
      const lead = button.previousElementSibling;
      if (firstOfAGroup.includes(name ?? '')) {
        expect(lead, name ?? '').toHaveAttribute('data-toolbar-divider');
        expect(lead).toHaveAttribute('aria-hidden', 'true');
      } else {
        expect(lead?.hasAttribute('data-toolbar-divider') ?? false).toBe(false);
      }
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
  // open when it became so closes, as its link and emoji menus do.
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

    expect(
      screen.queryByRole('group', { name: 'Insert a link, break or emoji' }),
    ).toBeNull();
  });
});

describe('the toolbar of a single-line field', () => {
  it('has only what a line can hold, and ignores assetBlocks', async () => {
    const field = renderField({
      singleLine: true,
      inlineValues: inlineValuesFor({ name: 'Name' }),
      pick: vi.fn(() => Promise.resolve('a1')),
    });
    await field.editor();

    // The emoji button stands alone.
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
    ]);
  });
});
