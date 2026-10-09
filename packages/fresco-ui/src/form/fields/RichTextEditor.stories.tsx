import type { Meta, StoryObj } from '@storybook/react-vite';
import type { JSONContent } from '@tiptap/react';
import { action } from 'storybook/actions';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { z } from 'zod/mini';

import Field from '../Field/Field';
import Form from '../Form';
import SubmitButton from '../SubmitButton';
import RichTextEditorField from './RichTextEditor';

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
 * `compact` is for a short label, such as the name of an option: the text area
 * is one line tall and as tall as the toolbar above it, so the editor reads as
 * two equal rows. It needs `singleLine`, which the types enforce.
 */
export const Compact: Story = {
  render: (args) => (
    <div className="flex w-[480px] flex-col gap-4">
      <div data-testid="editor">
        <RichTextEditorField
          {...args}
          singleLine
          compact
          toolbarOptions={{ headings: false, lists: false }}
          value={singleLineContent}
          onChange={action('onChange')}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const { editable, toolbar } = await measureEditor(canvasElement);

    // Two equal rows, and neither one is the 120px box of a prompt.
    await expect(Math.abs(editable - toolbar)).toBeLessThanOrEqual(1);
    await expect(editable).toBeLessThan(120);
  },
};

/**
 * `singleLine` alone limits the value to one line and nothing else, so a
 * prompt keeps the tall editing area a multi-line editor opens at.
 */
export const SingleLinePrompt: Story = {
  render: (args) => (
    <div className="flex w-[480px] flex-col gap-4">
      <div data-testid="editor">
        <RichTextEditorField
          {...args}
          singleLine
          toolbarOptions={{ headings: false, lists: false }}
          value={singleLineContent}
          onChange={action('onChange')}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const { editable } = await measureEditor(canvasElement);

    await expect(editable).toBeGreaterThanOrEqual(120);
  },
};

const tokenLine: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Add parents for ' },
        { type: 'token', attrs: { id: 'name' } },
      ],
    },
  ],
};

/**
 * `tokens` lets the text hold placeholders that are filled in later, such as
 * a person's name. Each shows as a chip, the caret steps over it, Backspace
 * removes it whole, and the toolbar has a button to insert each one.
 *
 * ```tsx
 * <RichTextEditorField
 *   compact
 *   toolbarOptions={{ bold: false, italic: false, history: false }}
 *   tokens={[{ id: 'name', label: 'Name' }]}
 *   value={value}
 *   onChange={setValue}
 * />
 * ```
 *
 * The value holds a token as `{ type: 'token', attrs: { id } }` in the
 * paragraph's content.
 */
export const WithTokens: Story = {
  render: (args) => (
    <div className="flex w-[480px] flex-col gap-4">
      <div data-testid="editor">
        <RichTextEditorField
          {...args}
          compact
          toolbarOptions={{ bold: false, italic: false, history: false }}
          tokens={[
            { id: 'name', label: 'Name' },
            { id: '#', label: 'Number' },
          ]}
          changeMode="input"
          value={tokenLine}
          onChange={action('onChange')}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox');
    await expect(editor.querySelectorAll('[data-token]')).toHaveLength(1);

    await userEvent.click(
      canvas.getByRole('button', { name: 'Insert “Number”' }),
    );

    await waitFor(() =>
      expect(editor.querySelector('[data-token="#"]')).not.toBeNull(),
    );
  },
};
