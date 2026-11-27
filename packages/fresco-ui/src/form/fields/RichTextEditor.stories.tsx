import { Autocomplete } from '@base-ui/react/autocomplete';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { JSONContent } from '@tiptap/react';
import { Braces } from 'lucide-react';
import { type ComponentProps, useRef, useState } from 'react';
import { action } from 'storybook/actions';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { z } from 'zod/mini';

import { Popover, PopoverContent } from '../../Popover';
import { inlineValuesFor } from '../../testing/inlineValues';
import { withMod } from '../../testing/modKey';
import Field from '../Field/Field';
import Form from '../Form';
import SubmitButton from '../SubmitButton';
import {
  ASSET_BLOCK_OUTLINE_OFFSET,
  ASSET_BLOCK_OUTLINE_WIDTH,
  assetBlockControlsProps,
  type RichTextAssetBlockViewProps,
  type RichTextAssetBlocks,
} from './richText/assetBlockNode';
import type {
  RichTextInsertState,
  RichTextInsertTools,
} from './richText/insertTools';
import RichTextEditorField, {
  ToolbarButton,
  toolbarLabelledButtonStyles,
} from './RichTextEditor';

const meta: Meta<typeof RichTextEditorField> = {
  title: 'Systems/Form/Fields/RichTextEditor',
  component: RichTextEditorField,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    'disabled': { control: 'boolean' },
    'readOnly': { control: 'boolean' },
    'aria-invalid': { control: 'boolean' },
  },
  args: {
    id: 'rich-text-editor',
    name: 'content',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Comprehensive initial content with all supported elements
const allElementsContent: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Heading Level 1' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'This is a paragraph with ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'bold text' },
        { type: 'text', text: ' and ' },
        { type: 'text', marks: [{ type: 'italic' }], text: 'italic text' },
        { type: 'text', text: ', as well as ' },
        {
          type: 'text',
          marks: [{ type: 'bold' }, { type: 'italic' }],
          text: 'bold italic text',
        },
        { type: 'text', text: '.' },
      ],
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Heading Level 2' }],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Here is another paragraph demonstrating the rich text capabilities.',
        },
      ],
    },
    {
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Heading Level 3' }],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'First bullet point' }],
            },
          ],
        },
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Second bullet with ' },
                { type: 'text', marks: [{ type: 'bold' }], text: 'bold' },
              ],
            },
          ],
        },
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Third bullet point' }],
            },
          ],
        },
      ],
    },
    {
      type: 'heading',
      attrs: { level: 4 },
      content: [{ type: 'text', text: 'Heading Level 4' }],
    },
    {
      type: 'orderedList',
      attrs: { start: 1 },
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'First numbered item' }],
            },
          ],
        },
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Second with ' },
                { type: 'text', marks: [{ type: 'italic' }], text: 'italics' },
              ],
            },
          ],
        },
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Third numbered item' }],
            },
          ],
        },
      ],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Final paragraph after the lists.' }],
    },
  ],
};

const simpleContent: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'This is simple content.' }],
    },
  ],
};

export const Default: Story = {
  render: (args) => (
    <div className="w-[600px]">
      <RichTextEditorField {...args} onChange={action('onChange')} />
    </div>
  ),
};

export const WithAllElements: Story = {
  render: (args) => (
    <div className="w-[600px]">
      <RichTextEditorField
        {...args}
        value={allElementsContent}
        onChange={action('onChange')}
      />
    </div>
  ),
};

export const ArchitectToolbar: Story = {
  render: (args) => (
    <div className="w-[600px]">
      <RichTextEditorField
        {...args}
        toolbarOptions={{ links: true, thematicBreak: true }}
        value={{
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Architect toolbar' }],
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'This mode matches Architect and adds ' },
                {
                  type: 'text',
                  marks: [
                    {
                      type: 'link',
                      attrs: { href: 'https://networkcanvas.com' },
                    },
                  ],
                  text: 'hyperlinks',
                },
                { type: 'text', text: '.' },
              ],
            },
            { type: 'horizontalRule' },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Bulleted item' }],
                    },
                  ],
                },
              ],
            },
          ],
        }}
        onChange={action('onChange')}
      />
    </div>
  ),
};

export const Disabled: Story = {
  render: (args) => (
    <div className="w-[600px]">
      <RichTextEditorField
        {...args}
        value={simpleContent}
        disabled
        onChange={action('onChange')}
      />
    </div>
  ),
};

export const ReadOnly: Story = {
  render: (args) => (
    <div className="w-[600px]">
      <RichTextEditorField
        {...args}
        value={simpleContent}
        readOnly
        onChange={action('onChange')}
      />
    </div>
  ),
};

export const Invalid: Story = {
  render: (args) => (
    <div className="w-[600px]">
      <RichTextEditorField
        {...args}
        value={simpleContent}
        aria-invalid
        onChange={action('onChange')}
      />
    </div>
  ),
};

export const InForm: Story = {
  render: () => (
    <Form
      onSubmit={async (data) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        action('form-submitted')(data);
        return { success: true };
      }}
      className="w-[600px]"
    >
      <Field
        name="description"
        label="Description"
        hint="Write a detailed description using rich text formatting"
        component={RichTextEditorField}
        custom={{
          schema: z.looseObject({}),
          hint: 'Enter rich text content',
        }}
      />
      <SubmitButton className="mt-4">Submit</SubmitButton>
    </Form>
  ),
};

// Toolbar Options Stories

export const NoHeadings: Story = {
  render: (args) => (
    <div className="w-[600px]">
      <RichTextEditorField
        {...args}
        toolbarOptions={{ headings: false }}
        onChange={action('onChange')}
      />
    </div>
  ),
};

export const OnlyH2AndH3: Story = {
  render: (args) => (
    <div className="w-[600px]">
      <RichTextEditorField
        {...args}
        toolbarOptions={{
          headings: { h1: false, h2: true, h3: true, h4: false },
        }}
        onChange={action('onChange')}
      />
    </div>
  ),
};

export const TextFormattingOnly: Story = {
  render: (args) => (
    <div className="w-[600px]">
      <RichTextEditorField
        {...args}
        toolbarOptions={{
          headings: false,
          lists: false,
          history: false,
        }}
        onChange={action('onChange')}
      />
    </div>
  ),
};

export const NoLists: Story = {
  render: (args) => (
    <div className="w-[600px]">
      <RichTextEditorField
        {...args}
        toolbarOptions={{ lists: false }}
        onChange={action('onChange')}
      />
    </div>
  ),
};

export const BulletListOnly: Story = {
  render: (args) => (
    <div className="w-[600px]">
      <RichTextEditorField
        {...args}
        toolbarOptions={{
          lists: { bullet: true, ordered: false },
        }}
        onChange={action('onChange')}
      />
    </div>
  ),
};

export const NoHistory: Story = {
  render: (args) => (
    <div className="w-[600px]">
      <RichTextEditorField
        {...args}
        toolbarOptions={{ history: false }}
        onChange={action('onChange')}
      />
    </div>
  ),
};

export const MinimalEditor: Story = {
  render: (args) => (
    <div className="w-[600px]">
      <RichTextEditorField
        {...args}
        toolbarOptions={{
          bold: true,
          italic: false,
          headings: false,
          lists: false,
          history: false,
        }}
        onChange={action('onChange')}
      />
    </div>
  ),
};

export const NoToolbar: Story = {
  render: (args) => (
    <div className="w-[600px]">
      <RichTextEditorField
        {...args}
        toolbarOptions={{
          bold: false,
          italic: false,
          headings: false,
          lists: false,
          history: false,
        }}
        onChange={action('onChange')}
      />
    </div>
  ),
};

const singleLineContent: JSONContent = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'A short label' }] },
  ],
};

/** The editable area and the toolbar of the editor a story rendered. */
async function measureEditor(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await waitFor(() =>
    expect(
      canvas.getByTestId('editor').querySelector('.tiptap'),
    ).not.toBeNull(),
  );
  const editor = canvas.getByTestId('editor');
  const editable = editor.querySelector('.tiptap')?.parentElement;
  const toolbar = within(editor).getByRole('toolbar');
  if (!editable) throw new Error('the story did not render');
  return {
    editable: editable.getBoundingClientRect().height,
    toolbar: toolbar.getBoundingClientRect().height,
  };
}

/**
 * `singleLine` is for text Enter cannot add a line to, such as a prompt or the
 * name of an option. The text area opens one line tall, as tall as the toolbar
 * above it, so the editor reads as two equal rows rather than as a box for
 * paragraphs.
 */
export const SingleLine: Story = {
  render: (args) => (
    <div className="flex w-[480px] flex-col gap-4">
      <div data-testid="editor">
        <RichTextEditorField
          {...args}
          singleLine
          value={singleLineContent}
          onChange={action('onChange')}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const { editable, toolbar } = await measureEditor(canvasElement);

    // Two equal rows, and neither one is the 120px box of a multi-line editor.
    await expect(Math.abs(editable - toolbar)).toBeLessThanOrEqual(1);
    await expect(editable).toBeLessThan(120);
  },
};

/**
 * Reaching the text with the keyboard rings the whole field, as it rings any
 * other text control: the text is not an input element, so the ring has to
 * name it.
 */
export const KeyboardFocusRing: Story = {
  render: (args) => (
    <div className="flex w-[480px] flex-col gap-4">
      <RichTextEditorField
        {...args}
        aria-label="Notes"
        singleLine
        value={singleLineContent}
        onChange={action('onChange')}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const editor = await within(canvasElement).findByRole('textbox', {
      name: 'Notes',
    });
    const field = editor.parentElement?.parentElement;
    if (!field) throw new Error('No field');
    await expect(getComputedStyle(field).outlineStyle).toBe('none');

    await userEvent.tab();
    await waitFor(() => expect(editor).toHaveFocus());
    // The ring's width eases in, so it is read once it has settled.
    await waitFor(() => {
      expect(getComputedStyle(field).outlineStyle).toBe('solid');
      expect(getComputedStyle(field).outlineWidth).toBe('2px');
    });
  },
};

/**
 * An invalid field keeps its focus ring: its red border says it is wrong, not
 * which field the keyboard is in.
 */
export const InvalidKeyboardFocusRing: Story = {
  render: (args) => (
    <div className="flex w-[480px] flex-col gap-4">
      <RichTextEditorField
        {...args}
        aria-label="Notes"
        aria-invalid
        singleLine
        value={singleLineContent}
        onChange={action('onChange')}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const editor = await within(canvasElement).findByRole('textbox', {
      name: 'Notes',
    });
    const field = editor.parentElement?.parentElement;
    if (!field) throw new Error('No field');

    await userEvent.tab();
    await waitFor(() => expect(editor).toHaveFocus());
    await waitFor(() => {
      expect(getComputedStyle(field).outlineStyle).toBe('solid');
      expect(getComputedStyle(field).outlineWidth).toBe('2px');
    });
    await expect(getComputedStyle(field).borderTopColor).not.toBe(
      'rgba(0, 0, 0, 0)',
    );
  },
};

const wrappingLine: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Within the past six months, who are the people you have discussed important personal matters with, whether in person, by phone, or online?',
        },
      ],
    },
  ],
};

/**
 * A single line that is longer than the field wraps, and the row grows to
 * hold it. The row keeps its padding, so the wrapped lines stay clear of the
 * toolbar's border above and the field's edge below.
 */
export const SingleLineWrapped: Story = {
  render: (args) => (
    <div className="flex w-[480px] flex-col gap-4">
      <div data-testid="editor">
        <RichTextEditorField
          {...args}
          singleLine
          value={wrappingLine}
          onChange={action('onChange')}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const { editable, toolbar } = await measureEditor(canvasElement);
    const text = canvasElement.querySelector('.tiptap p');
    if (!text) throw new Error('the story did not render');
    const lineHeight = Number.parseFloat(getComputedStyle(text).lineHeight);
    const textBox = text.getBoundingClientRect();
    const editableBox = canvasElement
      .querySelector('.tiptap')
      ?.parentElement?.getBoundingClientRect();
    if (!editableBox) throw new Error('the story did not render');

    // The text wrapped, and the row grew past the toolbar's height to hold it.
    await expect(textBox.height).toBeGreaterThan(lineHeight * 1.5);
    await expect(editable).toBeGreaterThan(toolbar);
    // Space between the wrapped lines and the row's edges.
    await expect(textBox.top - editableBox.top).toBeGreaterThanOrEqual(12);
    await expect(editableBox.bottom - textBox.bottom).toBeGreaterThanOrEqual(
      12,
    );
  },
};

const plainLine: JSONContent = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Ask about ' }] },
  ],
};

const oneValueLine: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Add ' },
        { type: 'inlineValue', attrs: { id: 'name' } },
        { type: 'text', text: ' parents' },
      ],
    },
  ],
};

function InlineValueEditor({
  label,
  labels,
  initial,
}: {
  label: string;
  /** The values it holds, by id; none at all where absent. */
  labels?: Record<string, string>;
  initial: JSONContent;
}) {
  const [value, setValue] = useState<JSONContent | undefined>(initial);
  return (
    <div className="flex w-[480px] flex-col gap-2">
      <RichTextEditorField
        id={label}
        name={label}
        aria-label={label}
        singleLine
        toolbarOptions={{ bold: false, italic: false }}
        inlineValues={
          labels === undefined ? undefined : inlineValuesFor(labels)
        }
        changeMode="input"
        value={value}
        onChange={setValue}
      />
      <pre data-testid={`${label} value`} className="text-xs">
        {JSON.stringify(value)}
      </pre>
    </div>
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const childrenOf = (node: unknown): readonly unknown[] =>
  isRecord(node) && Array.isArray(node.content) ? node.content : [];

/** The paragraph's parts in order: a run of words, or `{id}` for a value. */
const namePill = (editor: Element): HTMLElement => {
  const found = editor.querySelector('[data-inline-value="name"]');
  if (!(found instanceof HTMLElement)) throw new Error('No pill');
  return found;
};

const partsOf = (canvasElement: HTMLElement, label: string): string[] => {
  const value: unknown = JSON.parse(
    within(canvasElement).getByTestId(`${label} value`).textContent || 'null',
  );
  const paragraph = childrenOf(value)[0];
  return childrenOf(paragraph).map((node) => {
    if (!isRecord(node)) return '';
    if (node.type !== 'inlineValue') {
      return typeof node.text === 'string' ? node.text : '';
    }
    return `{${isRecord(node.attrs) ? String(node.attrs.id) : ''}}`;
  });
};

/**
 * A pill is one thing to the keyboard. The arrow keys go past it in one
 * step once it is selected, Backspace takes all of it, and undo puts it
 * back.
 */
export const InlineValuesFromTheKeyboard: Story = {
  render: () => (
    <InlineValueEditor
      label="Question"
      labels={{ name: 'Name' }}
      initial={oneValueLine}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Question' });
    const doc = canvasElement.ownerDocument;
    const pill = () => namePill(editor);
    await userEvent.click(editor);

    // user-event cannot move a caret through a contenteditable, so the
    // caret is placed directly and each key reaches ProseMirror's own
    // keydown handling, which is what keeps a pill whole.
    const press = (key: string, keyCode: number) => {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'keyCode', { value: keyCode });
      editor.dispatchEvent(event);
    };
    const caret = () => {
      const selection = doc.getSelection();
      if (selection === null || selection.rangeCount === 0) {
        throw new Error('No caret');
      }
      return selection.getRangeAt(0);
    };
    /** -1 before the pill, 1 after it, with no text between; 0 otherwise. */
    const besidePill = () => {
      const at = caret();
      if (!at.collapsed) return 0;
      const before = doc.createRange();
      before.setStartBefore(pill());
      before.collapse(true);
      const after = doc.createRange();
      after.setStartAfter(pill());
      after.collapse(true);
      const between = doc.createRange();
      if (before.comparePoint(at.startContainer, at.startOffset) <= 0) {
        between.setStart(at.startContainer, at.startOffset);
        between.setEndBefore(pill());
        return between.toString() === '' ? -1 : 0;
      }
      if (after.comparePoint(at.startContainer, at.startOffset) >= 0) {
        between.setStartAfter(pill());
        between.setEnd(at.startContainer, at.startOffset);
        return between.toString() === '' ? 1 : 0;
      }
      return 0;
    };

    const after = doc.createRange();
    after.setStartAfter(pill());
    after.collapse(true);
    doc.getSelection()?.removeAllRanges();
    doc.getSelection()?.addRange(after);
    await waitFor(() => expect(besidePill()).toBe(1));

    // One step selects the pill whole; the next leaves it, before it.
    press('ArrowLeft', 37);
    await waitFor(() => expect(pill()).toHaveClass('ProseMirror-selectednode'));
    press('ArrowLeft', 37);
    await waitFor(() => expect(besidePill()).toBe(-1));
    await expect(pill()).not.toHaveClass('ProseMirror-selectednode');

    // And the same forward, to just after it.
    press('ArrowRight', 39);
    await waitFor(() => expect(pill()).toHaveClass('ProseMirror-selectednode'));
    press('ArrowRight', 39);
    await waitFor(() => expect(besidePill()).toBe(1));

    // One Backspace takes the whole pill, and nothing else.
    press('Backspace', 8);
    await waitFor(() =>
      expect(partsOf(canvasElement, 'Question')).toEqual(['Add  parents']),
    );

    await userEvent.keyboard(withMod('z'));
    await waitFor(() =>
      expect(partsOf(canvasElement, 'Question')).toEqual([
        'Add ',
        '{name}',
        ' parents',
      ]),
    );
  },
};

/** A point just past the last character of `element`'s text. */
const endOf = (element: HTMLElement) => {
  const walker = element.ownerDocument.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
  );
  let last: Text | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text && node.data !== '') last = node;
  }
  if (last === null) throw new Error('No text to drop after');
  const range = element.ownerDocument.createRange();
  range.setStart(last, last.data.length);
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  return { clientX: rect.right - 1, clientY: rect.top + rect.height / 2 };
};

const dragPill = (pill: HTMLElement, onto: HTMLElement) => {
  const dataTransfer = new DataTransfer();
  pill.dispatchEvent(
    new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }),
  );
  onto.dispatchEvent(
    new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
      ...endOf(onto),
    }),
  );
  pill.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
  return dataTransfer;
};

/**
 * A value can be dragged to another place in the text, and it arrives whole.
 * Dropped into a field that holds no values, it becomes what pasting it there
 * makes: its words.
 */
export const DraggingAnInlineValue: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <InlineValueEditor
        label="Question"
        labels={{ name: 'Name' }}
        initial={oneValueLine}
      />
      <InlineValueEditor
        label="Dropped into"
        labels={undefined}
        initial={plainLine}
      />
      <InlineValueEditor
        label="Pasted into"
        labels={undefined}
        initial={plainLine}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Question' });

    const pill = () => namePill(editor);
    await waitFor(() => expect(pill().draggable).toBe(true));

    dragPill(pill(), editor);
    await waitFor(() =>
      expect(partsOf(canvasElement, 'Question')).toEqual([
        'Add  parents',
        '{name}',
      ]),
    );

    const dropTarget = canvas.getByRole('textbox', { name: 'Dropped into' });
    const pasteTarget = canvas.getByRole('textbox', { name: 'Pasted into' });
    const dragged = dragPill(pill(), dropTarget);

    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', dragged.getData('text/html'));
    clipboardData.setData('text/plain', dragged.getData('text/plain'));
    await userEvent.click(pasteTarget);
    const end = pasteTarget.ownerDocument.createRange();
    end.selectNodeContents(pasteTarget);
    end.collapse(false);
    pasteTarget.ownerDocument.getSelection()?.removeAllRanges();
    pasteTarget.ownerDocument.getSelection()?.addRange(end);
    pasteTarget.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );

    await waitFor(() => {
      const dropped = partsOf(canvasElement, 'Dropped into');
      expect(dropped.some((part) => part.startsWith('{'))).toBe(false);
      expect(dropped.join('')).toContain('Name');
      expect(dropped).toEqual(partsOf(canvasElement, 'Pasted into'));
    });
  },
};

const offeredValues = inlineValuesFor(
  { name: 'Name', age: 'Age' },
  {
    written: [
      { id: 'name', text: '{name}' },
      { id: 'age', text: '{age}' },
    ],
  },
);

const nameVersions: JSONContent = {
  type: 'versions',
  attrs: {
    label: 'Whether Name is known',
    summary: 'Name',
    versions: [
      {
        key: 'other',
        label: 'When Name is known',
        content: [{ type: 'inlineValue', attrs: { id: 'name' } }],
      },
      { key: 'missing', label: 'When Name is missing', content: [] },
    ],
  },
};

const INSERT_LABEL = 'Insert a value';

type OfferedValue = Readonly<{
  id: string;
  label: string;
  content: JSONContent;
}>;

const OFFERED: readonly OfferedValue[] = [
  { id: 'name', label: 'Name', content: nameVersions },
  {
    id: 'age',
    label: 'Age',
    content: { type: 'inlineValue', attrs: { id: 'age' } },
  },
];

/**
 * The consumer's own list of values: a search box, with the first match
 * highlighted so Enter inserts it.
 */
function ValueList({ onPick }: { onPick: (value: OfferedValue) => void }) {
  return (
    <Autocomplete.Root
      items={OFFERED}
      inline
      open
      autoHighlight="always"
      itemToStringValue={(item: OfferedValue) => item.label}
    >
      <div className="flex w-72 flex-col gap-2">
        <Autocomplete.Input
          autoFocus
          aria-label="Search"
          placeholder="Search"
          className="focusable h-10 rounded-sm border border-current/20 px-3 text-sm"
        />
        <Autocomplete.List aria-label={INSERT_LABEL}>
          {(item: OfferedValue) => (
            <Autocomplete.Item
              key={item.id}
              value={item}
              onClick={() => onPick(item)}
              className="data-highlighted:bg-primary data-highlighted:text-primary-contrast rounded-sm px-2 py-1.5 text-sm"
            >
              {item.label}
            </Autocomplete.Item>
          )}
        </Autocomplete.List>
      </div>
    </Autocomplete.Root>
  );
}

/**
 * A consumer's insert tools: a toolbar button that opens a searchable list
 * of values, which also opens where `{` is typed. A pick goes in through
 * `insert.commands.insertContent`, in place of the brace.
 */
function ValueMenu({ insert }: { insert: RichTextInsertState }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const { trigger, commands } = insert;
  const open = menuOpen || trigger !== null;
  const close = () => {
    setMenuOpen(false);
    trigger?.dismiss();
  };
  const pick = (item: OfferedValue) => {
    setMenuOpen(false);
    commands.insertContent(item.content);
  };
  return (
    <>
      <ToolbarButton
        ref={button}
        className={toolbarLabelledButtonStyles}
        disabled={!insert.editable}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setMenuOpen((was) => !was)}
      >
        <Braces aria-hidden />
        Value
      </ToolbarButton>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <PopoverContent
          anchor={trigger?.anchor ?? button}
          side="bottom"
          align="start"
          spacing="xs"
          aria-label={INSERT_LABEL}
          finalFocus={commands.returnFocus}
        >
          <ValueList onPick={pick} />
        </PopoverContent>
      </Popover>
    </>
  );
}

const valueMenu: RichTextInsertTools = {
  label: 'Insert a value',
  render: (insert: RichTextInsertState) => <ValueMenu insert={insert} />,
};

function EditorWithValue({ initial }: { initial: JSONContent | undefined }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex w-[560px] flex-col gap-4">
      <RichTextEditorField
        id="versions-editor"
        name="versions-editor"
        aria-label="Question"
        singleLine
        toolbarOptions={{ headings: false, lists: false }}
        inlineValues={offeredValues}
        versions
        insertTools={valueMenu}
        changeMode="input"
        value={value}
        onChange={setValue}
      />
      <pre data-testid="value" className="text-xs whitespace-pre-wrap">
        {JSON.stringify(value)}
      </pre>
    </div>
  );
}

const valueOf = (canvasElement: HTMLElement): JSONContent =>
  JSON.parse(
    within(canvasElement).getByTestId('value').textContent || 'null',
  ) as JSONContent;

/**
 * A consumer offers things to insert through insert tools of its own in the
 * toolbar, here a searchable menu that also opens where `{` is typed. The
 * tools insert whatever content the consumer gives them
 * (`commands.insertContent`): here a placeholder, or **versions** of a piece of
 * text, which read differently in different cases. Each version is written
 * in place in an editor of its own, and the versions are one element of the
 * line.
 *
 * ```tsx
 * <RichTextEditorField
 *   inlineValues={{ spec, text, version, written: [{ id: 'name', text: '{name}' }] }}
 *   versions
 *   insertTools={{
 *     label: 'Insert a value',
 *     render: (insert) => <ValueMenu insert={insert} />,
 *   }}
 *   value={value}
 *   onChange={setValue}
 * />
 * ```
 */
export const WithVersionsAndInsertTools: Story = {
  render: () => (
    <EditorWithValue
      initial={{
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Tell us about ' }],
          },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const editor = await canvas.findByRole('textbox', { name: 'Question' });
    await userEvent.click(editor);

    // Inserted from the toolbar, by searching and choosing.
    await userEvent.click(canvas.getByRole('button', { name: 'Value' }));
    const search = await body.findByRole('combobox', { name: 'Search' });
    await userEvent.type(search, 'nam');
    await userEvent.keyboard('{Enter}');

    // Just inserted, the versions are open for writing, in the pill's
    // place, one to a row in the order given; the caret is back in the line.
    const missing = await canvas.findByRole('textbox', {
      name: 'When Name is missing',
    });
    await waitFor(() => expect(editor).toHaveFocus());
    const group = canvas.getByRole('group', { name: 'Whether Name is known' });
    const pill = group.querySelector('[data-versions-pill]');
    await expect(pill).toHaveAttribute('aria-expanded', 'true');
    await expect(pill).not.toBeVisible();
    const known = canvas.getByRole('textbox', { name: 'When Name is known' });
    await expect(known.getBoundingClientRect().top).toBeLessThan(
      missing.getBoundingClientRect().top,
    );
    // An empty version says it shows nothing; the hint is not its text.
    await expect(missing.querySelector('p')).toHaveAttribute(
      'data-placeholder',
      'Shows nothing',
    );
    await expect(missing.textContent).toBe('');

    // Undo takes the insertion back, and redo brings it again.
    await userEvent.keyboard(withMod('z'));
    await waitFor(() =>
      expect(
        canvas.queryByRole('group', { name: 'Whether Name is known' }),
      ).toBeNull(),
    );
    await userEvent.keyboard(withMod('{Shift>}z{/Shift}'));
    const restored = await canvas.findByRole('group', {
      name: 'Whether Name is known',
    });
    // Redone, it is open again if the redo selected it; its pill opens it if not.
    const restoredPill = restored.querySelector<HTMLElement>(
      '[data-versions-pill]',
    );
    if (restoredPill !== null && !restoredPill.hidden) {
      await userEvent.click(restoredPill);
    }
    await canvas.findByRole('textbox', { name: 'When Name is missing' });
    // Each version is as tall as its line of words, not as the field's own
    // text area: an empty one included.
    const lineHeight =
      Number.parseFloat(getComputedStyle(editor).fontSize) * 2.5;
    for (const name of ['When Name is missing', 'When Name is known']) {
      await expect(
        canvas.getByRole('textbox', { name }).getBoundingClientRect().height,
      ).toBeLessThan(lineHeight);
    }
    // A version is written in place.
    await userEvent.click(
      canvas.getByRole('textbox', { name: 'When Name is missing' }),
    );
    await userEvent.keyboard('this person');
    await waitFor(() =>
      expect(JSON.stringify(valueOf(canvasElement))).toContain('this person'),
    );

    // Escape leaves the version with the versions selected and folded to
    // their pill; Backspace then removes them whole, and undo brings them
    // back.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(editor).toHaveFocus());
    await expect(canvas.getByRole('button', { name: /^Name/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    // Apart from the edits before it, so undo takes back only the removal.
    // The history groups edits made within 500 ms of each other, and nothing
    // on the page reports that window closing, so this waits it out.
    await new Promise((resolve) => setTimeout(resolve, 600));
    await userEvent.keyboard('{Backspace}');
    await waitFor(() =>
      expect(
        canvas.queryByRole('group', { name: 'Whether Name is known' }),
      ).toBeNull(),
    );
    await userEvent.keyboard(withMod('z'));
    await expect(
      await canvas.findByRole('group', { name: 'Whether Name is known' }),
    ).toBeInTheDocument();
  },
};

/**
 * A field whose whole text is one set of versions, such as a message that is
 * a plural or a choice and nothing more: the versions are listed open, one
 * labelled row each, with no pill to open and nothing that folds when the
 * field is left. Words typed beside them make the text a sentence with
 * versions in it, which folds to a pill as before.
 *
 * ```tsx
 * <RichTextEditorField versions … />
 * ```
 */
export const WholeMessageVersionsOpen: Story = {
  render: () => (
    <EditorWithValue
      initial={{
        type: 'doc',
        content: [{ type: 'paragraph', content: [nameVersions] }],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Question' });

    // Shown at rest, in the order given, with nothing to open.
    const known = await canvas.findByRole('textbox', {
      name: 'When Name is known',
    });
    const missing = canvas.getByRole('textbox', {
      name: 'When Name is missing',
    });
    await expect(known).toBeVisible();
    await expect(missing).toBeVisible();
    await expect(known.getBoundingClientRect().top).toBeLessThan(
      missing.getBoundingClientRect().top,
    );
    await expect(
      canvasElement.querySelector('[data-versions-pill]'),
    ).toBeNull();
    const group = canvas.getByRole('group', { name: 'Whether Name is known' });
    await expect(group.querySelector('[aria-expanded]')).toBeNull();

    // Reached with Tab: the line (which shows the field's focus ring), then
    // each row, which shows its own.
    await userEvent.tab();
    await waitFor(() => expect(editor).toHaveFocus());
    const field = editor.parentElement?.parentElement;
    if (!field) throw new Error('No field');
    await waitFor(() =>
      expect(getComputedStyle(field).outlineStyle).not.toBe('none'),
    );
    await userEvent.tab();
    await waitFor(() => expect(known).toHaveFocus());
    await userEvent.tab();
    await waitFor(() => expect(missing).toHaveFocus());

    // The arrow keys step between rows from a line's first or last place.
    await userEvent.keyboard('{ArrowUp}');
    await waitFor(() => expect(known).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(missing).toHaveFocus());

    // Escape hands the caret back to the line and hides nothing.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(editor).toHaveFocus());
    await expect(known).toBeVisible();
    await expect(missing).toBeVisible();

    // Leaving the field folds nothing either.
    await userEvent.click(canvasElement.ownerDocument.body);
    await expect(known).toBeVisible();
    await expect(missing).toBeVisible();

    // A version is written in place.
    await userEvent.click(missing);
    await userEvent.keyboard('this person');
    await waitFor(() =>
      expect(JSON.stringify(valueOf(canvasElement))).toContain('this person'),
    );
  },
};

/**
 * The same versions in a sentence fold to a pill: only a text that is nothing
 * but the versions lists them open.
 */
export const VersionsInASentenceStayFolded: Story = {
  render: () => (
    <EditorWithValue
      initial={{
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Tell us about ' }, nameVersions],
          },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pill = await canvas.findByRole('button', { name: /^Name/ });
    await expect(pill).toHaveAttribute('aria-expanded', 'false');
    await expect(
      canvas.queryByRole('textbox', { name: 'When Name is known' }),
    ).toBeNull();

    // Opened by its pill, as before.
    await userEvent.click(pill);
    await expect(
      await canvas.findByRole('textbox', { name: 'When Name is known' }),
    ).toBeVisible();
  },
};

/**
 * Waits until the open value menu's search box holds focus, as someone
 * typing into it would. Keys pressed before then go wherever focus still is:
 * in CI the first letter of a search has landed in the text instead.
 */
const searchHasFocus = async (body: ReturnType<typeof within>) => {
  const search = await body.findByRole('combobox', { name: 'Search' });
  await waitFor(() => expect(search).toHaveFocus());
};

const typeIntoTheValueMenu = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  const editor = await canvas.findByRole('textbox', { name: 'Question' });
  await userEvent.click(editor);

  await userEvent.keyboard('Aged {{');
  await searchHasFocus(body);
  await userEvent.keyboard('age{Enter}');
  // Waited for as text, so a failure shows where the typing went.
  await waitFor(() => expect(editor).toHaveTextContent(/^Aged Age$/));
  await expect(
    editor.querySelector('[data-inline-value="age"]'),
  ).not.toBeNull();

  // Typed where the pick left the caret: after the item.
  await userEvent.keyboard(' {{');
  await searchHasFocus(body);
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(editor).toHaveTextContent(/^Aged Age \{$/));

  // Pasted where Escape left the caret: after the brace.
  await userEvent.paste(' and {age}');
  await waitFor(() =>
    expect(editor.querySelectorAll('[data-inline-value="age"]')).toHaveLength(
      2,
    ),
  );
  await expect(editor).toHaveTextContent(/^Aged Age \{ and Age$/);
};

/**
 * Typing `{` (`INSERT_TRIGGER`) tells the insert tools where it was typed
 * (`insert.trigger`), and these open their menu there. Choosing an item replaces
 * the brace; Escape closes the menu and keeps it as text (`trigger.dismiss`).
 * Either way the caret comes back where it was. Pasting a placeholder written
 * as text, such as `{age}`, makes the placeholder.
 */
export const InsertToolsFromTheKeyboard: Story = {
  render: () => <EditorWithValue initial={undefined} />,
  play: ({ canvasElement }) => typeIntoTheValueMenu(canvasElement),
};

/**
 * Has `win` run as a slow device does, until the returned function puts it
 * back. Animation frames come after the tasks already waiting, and every time
 * an editor takes focus a long task follows, longer than the 200 ms within
 * which ProseMirror takes back a caret the browser moved to the start of the
 * text as it focused the editor.
 */
const runAsASlowDevice = (win: Window) => {
  const requestFrame = win.requestAnimationFrame.bind(win);
  const cancelFrame = win.cancelAnimationFrame.bind(win);
  const cancelled = new Set<number>();
  win.requestAnimationFrame = (callback) => {
    const id = requestFrame((time) => {
      win.setTimeout(() => {
        if (!cancelled.delete(id)) callback(time);
      });
    });
    return id;
  };
  win.cancelAnimationFrame = (id) => {
    cancelled.add(id);
    cancelFrame(id);
  };
  const longTaskOnFocus = ({ target }: FocusEvent) => {
    if (!(target instanceof HTMLElement) || !target.isContentEditable) return;
    const until = win.performance.now() + 250;
    while (win.performance.now() < until) {
      // The device is busy.
    }
  };
  win.document.addEventListener('focusin', longTaskOnFocus);
  return () => {
    win.document.removeEventListener('focusin', longTaskOnFocus);
    win.requestAnimationFrame = requestFrame;
    win.cancelAnimationFrame = cancelFrame;
  };
};

/**
 * The same on a slow device: the caret still comes back where it was, rather
 * than at the start of the text where the browser puts it as the editor takes
 * focus.
 */
export const InsertToolsFromTheKeyboardOnASlowDevice: Story = {
  render: () => <EditorWithValue initial={undefined} />,
  play: async ({ canvasElement }) => {
    const restore = runAsASlowDevice(
      canvasElement.ownerDocument.defaultView ?? window,
    );
    try {
      await typeIntoTheValueMenu(canvasElement);
    } finally {
      restore();
    }
  },
};

/**
 * Every editor offers emoji. Typing a colon and the start of an emoji's name
 * (`:ro`) suggests emoji beside the caret while the keyboard stays in the
 * text: what is typed next narrows the list, the arrow keys move through
 * it, Enter or Tab takes the one highlighted, and Escape puts it away. A
 * colon in a sentence ("Note: …", "10:30") suggests nothing. The toolbar's
 * button opens the same emoji as a menu to search. An emoji is inserted as
 * the character itself, so the stored text is unchanged.
 * `emojiMenu={false}` leaves both out.
 */
export const Emoji: Story = {
  render: () => <EditorWithValue initial={undefined} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const editor = await canvas.findByRole('textbox', { name: 'Question' });
    await userEvent.click(editor);

    // Typed: suggestions beside the caret, the keyboard still in the text.
    await userEvent.keyboard(':ro');
    const list = await canvas.findByRole('listbox', {
      name: 'Emoji suggestions',
    });
    await expect(editor).toHaveFocus();
    await userEvent.keyboard('cket');
    await waitFor(() =>
      expect(within(list).getAllByRole('option')[0]).toHaveTextContent(
        '🚀:rocket:',
      ),
    );
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(editor).toHaveTextContent('🚀'));
    await expect(canvas.queryByRole('listbox')).toBeNull();

    // From the toolbar: the same emoji, as a menu to search.
    await userEvent.click(canvas.getByRole('button', { name: 'Insert emoji' }));
    const search = await body.findByRole('combobox', { name: 'Search' });
    await userEvent.type(search, 'hospital');
    await userEvent.click(await body.findByRole('option', { name: /🏥/ }));
    await waitFor(() => expect(editor).toHaveTextContent('🚀🏥'));
  },
};

// A stand-in for what a consumer draws for a file: it says which file and how
// it is shown, and offers the controls a block's view is given.
function StoryAssetBlockView({
  attributes,
  selected,
  editable,
  update,
  remove,
}: RichTextAssetBlockViewProps) {
  return (
    <div className="bg-surface-1 rounded-sm border p-3">
      <p data-testid="asset-block-summary">
        {attributes.assetId}, size {attributes.size ?? 'full'}, aligned{' '}
        {attributes.align}
      </p>
      {selected && editable && (
        <div {...assetBlockControlsProps} className="mt-2 flex gap-2">
          <button type="button" onClick={() => update({ size: 'small' })}>
            Small
          </button>
          <button type="button" onClick={() => remove()}>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

const storyAssetBlocks: RichTextAssetBlocks = {
  pick: (kind) => Promise.resolve(`${kind}-1`),
  View: StoryAssetBlockView,
};

/** The field as wide as a page's content, holding its text as it changes. */
function PageContentField({
  initial,
  ...props
}: Omit<ComponentProps<typeof RichTextEditorField>, 'value' | 'onChange'> & {
  initial: JSONContent;
}) {
  const [value, setValue] = useState<JSONContent | undefined>(initial);
  return (
    <div className="w-[48rem]">
      <RichTextEditorField
        {...props}
        aria-label="Page content"
        changeMode="input"
        value={value}
        onChange={setValue}
      />
    </div>
  );
}

/**
 * A field whose text can hold files as blocks among its paragraphs. The
 * consumer chooses a file (`pick`) and draws a block (`View`); the toolbar
 * offers one button for each kind of file. A block is one whole thing: arrow
 * to it, press Enter to reach its controls, Escape to come back out.
 */
export const WithAssetBlocks: Story = {
  render: (args) => (
    <PageContentField
      {...args}
      assetBlocks={storyAssetBlocks}
      initial={{
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Before the picture' }],
          },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Page content' });
    await userEvent.click(editor);
    await userEvent.click(canvas.getByRole('button', { name: 'Insert image' }));
    const summary = await canvas.findByTestId('asset-block-summary');
    await expect(summary).toHaveTextContent(
      'image-1, size full, aligned center',
    );
    // The block just placed is selected, and outlined as its consumer is told
    // it is: a consumer places things on that outline by these numbers.
    const block = summary.closest('[data-asset-block]');
    if (block === null) throw new Error('No block around the view');
    await waitFor(() => expect(block).toHaveAttribute('data-selected'));
    const outline = getComputedStyle(block);
    await expect(outline.outlineWidth).toBe(`${ASSET_BLOCK_OUTLINE_WIDTH}px`);
    await expect(outline.outlineOffset).toBe(`${ASSET_BLOCK_OUTLINE_OFFSET}px`);
  },
};

/**
 * The list of text styles, open: each style's name is set the way a line of
 * that style is, so the list shows how large each is before it is chosen.
 * The control that opens it keeps to the toolbar's size.
 */
export const TextStyleMenu: Story = {
  render: (args) => (
    <PageContentField
      {...args}
      initial={{
        type: 'doc',
        content: [1, 2, 3, 4].map((level) => ({
          type: 'heading',
          attrs: { level },
          content: [{ type: 'text', text: `Heading ${level}` }],
        })),
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const editor = await canvas.findByRole('textbox', { name: 'Page content' });
    await userEvent.click(within(editor).getByText('Heading 2'));
    const trigger = await canvas.findByRole('button', {
      name: 'Text style: Heading 2',
    });
    const triggerHeight = trigger.getBoundingClientRect().height;

    await userEvent.click(trigger);
    await body.findByRole('menu');
    const font = (element: Element) => {
      const style = getComputedStyle(element);
      return `${style.fontFamily} ${style.fontWeight} ${style.fontSize}`;
    };
    // The name is the item's last child, after the tick every item has.
    const nameIn = (name: string) => {
      const label = body.getByRole('menuitemradio', { name }).lastElementChild;
      if (label === null) throw new Error(`No name in the ${name} item`);
      return label;
    };
    // Each heading's name in the list is set as that heading is in the text.
    for (const level of [1, 2, 3, 4]) {
      const line = editor.querySelector(`h${level}`);
      if (line === null) throw new Error(`No heading ${level} in the text`);
      await expect(font(nameIn(`Heading ${level}`))).toBe(font(line));
      // And the item is tall enough to hold it.
      const item = body.getByRole('menuitemradio', {
        name: `Heading ${level}`,
      });
      await expect(item.scrollHeight).toBeLessThanOrEqual(item.clientHeight);
    }
    // Largest first, down to the paragraph.
    const sizes = [
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Heading 4',
      'Paragraph',
    ].map((name) => Number.parseFloat(getComputedStyle(nameIn(name)).fontSize));
    await expect(sizes.toSorted((a, b) => b - a)).toEqual(sizes);
    await expect(new Set(sizes).size).toBe(sizes.length);
    // The control keeps the toolbar's size whatever the line's style is.
    await expect(trigger.getBoundingClientRect().height).toBe(triggerHeight);
  },
};

/**
 * Text in English, written in an Arabic interface: the field sits in a region
 * that says the text's language, as a host marks the translation it edits.
 * The words the field writes itself, the text style's name and the
 * placeholder, say the interface's language, and so take its typeface.
 */
export const InterfaceWordsInTextOfAnotherLanguage: Story = {
  globals: { appLocale: 'ar' },
  render: (args) => (
    <div lang="en-US" dir="ltr" data-testid="text-region">
      <PageContentField
        {...args}
        placeholder="Type your page content..."
        initial={{ type: 'doc', content: [{ type: 'paragraph' }] }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Page content' });
    const trigger = canvas.getByRole('button', { name: /^Text style: / });
    const label = trigger.querySelector(':scope > span:not(.sr-only)');
    if (label === null) throw new Error('The text style shows no name');
    const languageOf = (element: Element) => ({
      lang: element.closest('[lang]')?.getAttribute('lang'),
      dir: element.closest('[dir]')?.getAttribute('dir'),
    });
    await expect(languageOf(label)).toEqual({ lang: 'ar', dir: 'rtl' });
    // Set in the Arabic typeface, which `:lang(ar)` gives (arabic-text.css),
    // where the text's own paragraphs are not.
    const face = (element: Element) => getComputedStyle(element).fontFamily;
    await expect(face(label)).toMatch(/Readex Pro/);
    // The empty text's placeholder: its paragraph says the interface's
    // language until something is typed, and the placeholder reads in its
    // own direction while the caret stays where the text starts.
    const empty = editor.querySelector('p');
    if (empty === null) throw new Error('The text holds no paragraph');
    await expect(empty).toHaveAttribute('lang', 'ar');
    await expect(getComputedStyle(empty, '::before').unicodeBidi).toBe(
      'plaintext',
    );
    await userEvent.click(editor);
    await userEvent.keyboard('Hello');
    await waitFor(() => expect(editor).toHaveTextContent('Hello'));
    const typed = editor.querySelector('p');
    if (typed === null) throw new Error('The text holds no paragraph');
    await expect(typed).not.toHaveAttribute('lang');
    await expect(languageOf(typed).lang).toBe('en-US');
    await expect(face(typed)).not.toMatch(/Readex Pro/);
  },
};

/**
 * Text selected across a block: the block is covered in the colour of the
 * selected text around it, as it is copied, cut or typed over with it. A
 * block selected by itself is outlined instead (`WithAssetBlocks`).
 */
export const SelectionAcrossAnAssetBlock: Story = {
  render: (args) => (
    <PageContentField
      {...args}
      assetBlocks={storyAssetBlocks}
      initial={{
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Before the picture' }],
          },
          { type: 'assetBlock', attrs: { assetId: 'image-1' } },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'After the picture' }],
          },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Page content' });
    const summary = await canvas.findByTestId('asset-block-summary');
    const block = summary.closest('[data-asset-block]');
    if (block === null) throw new Error('No block around the view');

    // A caret is no selection.
    await userEvent.click(within(editor).getByText('After the picture'));
    await expect(block).not.toHaveAttribute('data-in-selected-text');

    // Everything, with the platform's select-all: the block goes with the
    // text, and is covered as the text is.
    await userEvent.keyboard(withMod('a'));
    await waitFor(() => expect(block).toHaveAttribute('data-in-selected-text'));
    // Part of the selection, not the selection itself: no outline.
    await expect(block).not.toHaveAttribute('data-selected');
    await expect(getComputedStyle(block, '::after').content).not.toBe('none');

    // Collapsed again, to the end of the text, it is not.
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() =>
      expect(block).not.toHaveAttribute('data-in-selected-text'),
    );
    await expect(getComputedStyle(block, '::after').content).toBe('none');

    // And left selected, to be seen.
    await userEvent.keyboard(withMod('a'));
    await waitFor(() => expect(block).toHaveAttribute('data-in-selected-text'));
  },
};

/**
 * Selects all of the editor's text the way a test driver or another tool
 * does, by changing the page's selection, then focuses the editor and presses
 * Delete, all in one task: the browser's `selectionchange` event, which is
 * how the editor hears of the new selection, has not run yet.
 */
const selectEverythingAndDelete = (editor: HTMLElement) => {
  const selection = editor.ownerDocument.getSelection();
  if (selection === null) throw new Error('The page has no selection');
  const range = editor.ownerDocument.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  editor.focus();
  editor.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Delete',
      code: 'Delete',
      keyCode: 46,
      bubbles: true,
      cancelable: true,
    }),
  );
};

/**
 * A key pressed straight after the page's selection changes acts on the new
 * selection. The browser tells the editor of a selection a moment after it
 * changes, and a key can arrive first: a test driver, a screen reader or a
 * script that selects the text and presses Delete would otherwise delete
 * nothing, because the key would act on the caret the editor had before.
 */
export const DeleteStraightAfterSelectingEverything: Story = {
  render: (args) => (
    <PageContentField
      {...args}
      initial={{
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Welcome' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Welcome to this interview.' }],
          },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Page content' });
    await expect(editor).toHaveTextContent('Welcome to this interview.');

    // The editor takes focus as the text is selected.
    selectEverythingAndDelete(editor);
    await waitFor(() => expect(editor.textContent).toBe(''));

    // And it already has focus, with a caret of its own.
    await userEvent.keyboard('Thank you');
    await expect(editor).toHaveTextContent('Thank you');
    selectEverythingAndDelete(editor);
    await waitFor(() => expect(editor.textContent).toBe(''));
  },
};

/**
 * Text that the editor itself selected is replaced by the next key. Reading
 * the page's selection before a key (see the story above) must not put back
 * an older selection: the select-all and the typing are one keyboard call, so
 * each key arrives straight after the one before it.
 */
export const TypeOverTextTheEditorSelected: Story = {
  render: (args) => (
    <PageContentField
      {...args}
      initial={{
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Welcome to this interview.' }],
          },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Page content' });
    await expect(editor).toHaveTextContent('Welcome to this interview.');

    await userEvent.click(editor);
    await userEvent.keyboard(`${withMod('a')}Thank you`);
    await waitFor(() => expect(editor.textContent).toBe('Thank you'));
  },
};
